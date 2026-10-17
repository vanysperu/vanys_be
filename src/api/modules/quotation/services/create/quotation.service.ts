import { DataBase } from "../../../../../database";
import { addDaysToDateOnly, nowUtc, toBusinessDateOnly } from "../../../../../utils/dateUtils";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { getOrderedProductionStages } from "../shared/production_stages";
import { computeQuotationTotal } from "../../model/quotation.model";
import { QuotationItemPricingMode } from "../../model/quotation_item.model";
import { ProductModel } from "../../../product/model/product.model";
import { CustomizationTechniqueModel } from "../../../customization_technique/model/customization_technique.model";
import { getIgvRate } from "../shared/tax_config";
import { getQuotationValidityDays } from "../shared/quotation_validity";
import { roundMoney } from "../../../../../utils/numbers";

// Un admin de empresa no debe poder armar una cotización que referencie el
// cliente/producto/técnica de OTRA empresa, aunque conozca sus ids (CLAUDE.md
// sección 10) — el controller ya valida que company_id sea el suyo, pero eso
// solo, protege el dueño de la cotización en sí, no lo que referencia.
export class TenantMismatchError extends Error {}

// Deshabilitar un cliente/producto/técnica (soft-delete, is_deleted = true)
// significa "ya no se usa" — pero nada impedía seguir cotizándolo: el
// formulario ya no lo ofrece, pero la API aceptaba el id igual. Así un
// producto retirado (o con precio viejo) seguía entrando en cotizaciones
// nuevas por un formulario cacheado o una llamada directa. Las cotizaciones
// YA EXISTENTES que lo referencian no se tocan — se siguen viendo completas,
// solo se bloquea usarlo en una cotización nueva.
export class DisabledCatalogEntityError extends Error {}

export interface CreateQuotationItemInput {
  product_id: number;
  // Obligatoria (pedido explícito del usuario: "tipo de personalización es
  // obligatorio para cada producto") — el validator ya la exige antes de
  // llegar acá.
  technique_id: number;
  // Cantidad real de unidades pedidas — siempre obligatoria, en todos los
  // modos. El subtotal es precio_por_unidad × cantidad; pedir más que el
  // tamaño "típico" del modo (ej. 1100 en modo millar) sigue cobrando la
  // tarifa de ese modo para todas las unidades.
  quantity: number;
  // Qué precio de catálogo del producto usar (unidad/ciento/medio millar/
  // millar) o si lleva un precio personalizado propio de esta cotización —
  // ver QuotationItemPricingMode.
  pricing_mode: QuotationItemPricingMode;
  // Precio POR UNIDAD, obligatorio solo cuando pricing_mode="custom" — no
  // toca el catálogo del producto, es propio de este item.
  custom_price?: number | null;
  // Extra POR UNIDAD de la técnica, solo aplica cuando pricing_mode="custom"
  // y la técnica es extra_type="fixed" (percentage no lo necesita, ya
  // escala desde custom_price). Si no se manda, cae a technique.price_unit
  // como antes (pedido explícito del usuario: "cuando se le da
  // personalizado debe darte para colocar el precio del producto y de la
  // técnica").
  custom_technique_price?: number | null;
}

export interface CreateQuotationInput {
  company_id: number;
  business_unit_id?: number | null;
  client_id: number;
  notes?: string | null;
  valid_until?: string | null;
  // Opcional: si el cliente pide que la cotización salga a nombre de otra
  // persona/empresa, esto es SOLO lo que se imprime en el PDF — client_id
  // sigue siendo el cliente real vinculado (mismo historial/pagos).
  billing_name?: string | null;
  billing_document_number?: string | null;
  // Días hábiles que toma la producción una vez aprobado el diseño —
  // informativo, no dispara ninguna fecha automática.
  production_days?: number | null;
  items: CreateQuotationItemInput[];
  // Banderas de la cotización (pedido explícito del usuario): delivery/
  // diseño son solo informativas (evidencian si el precio ya los incluye),
  // IGV sí afecta el cálculo — ver computeQuotationTotal.
  includes_delivery?: boolean;
  includes_design?: boolean;
  includes_igv?: boolean;
}

// Precio de la técnica por modo de precio ("fixed"): mismo criterio de
// tarifa-por-volumen que el producto (CATALOG_PRICE_FIELD más abajo) — una
// personalización por millar suele salir más barata por unidad que una
// personalización de unidades sueltas. pricing_mode="custom" no tiene un
// modo de catálogo propio (el producto ya usa un precio 100% libre), así
// que la técnica cae a su price_unit como aproximación razonable. Si la
// técnica no tiene cargado un precio para ese modo específico, el extra es
// 0 (a diferencia del producto, la técnica es opcional — no todas
// necesitan estar completas en los 4 modos).
const resolveTechniqueTierExtra = (
  technique: CustomizationTechniqueModel,
  pricingMode: QuotationItemPricingMode,
  customTechniquePrice?: number | null
): number => {
  if (pricingMode === "custom") {
    if (customTechniquePrice !== null && customTechniquePrice !== undefined) return Number(customTechniquePrice);
    return technique.price_unit === null || technique.price_unit === undefined ? 0 : Number(technique.price_unit);
  }
  const value = technique[CATALOG_PRICE_FIELD[pricingMode]];
  return value === null || value === undefined ? 0 : Number(value);
};

// Precio del item = precio base del producto + el extra de la técnica
// elegida — "fixed" es una tarifa POR MODO (igual que el producto),
// "percentage" sigue siendo un % sobre el precio base (ya escala solo con
// el modo, porque basePrice también cambia por modo).
//
// MySQL/Sequelize devuelve DECIMAL como string (evita perder precisión de
// punto flotante) — Number(...) es obligatorio antes de sumar, si no "+"
// hace concatenación de texto en vez de suma ("50" + "15.00" = "5015.00").
const resolveUnitPrice = (
  basePrice: number,
  technique: CustomizationTechniqueModel | null,
  pricingMode: QuotationItemPricingMode,
  customTechniquePrice?: number | null
) => {
  if (!technique) return basePrice;

  if (technique.extra_type === "percentage") {
    return basePrice + (basePrice * Number(technique.extra_value)) / 100;
  }
  return basePrice + resolveTechniqueTierExtra(technique, pricingMode, customTechniquePrice);
};

// La cantidad es siempre obligatoria — no hay "lote de respaldo": cada
// modo de precio (unidad/ciento/medio millar/millar/personalizado) es solo
// una tarifa POR UNIDAD, y quien cotiza siempre dice cuántas unidades
// pide.
class MissingQuantityError extends Error {}

const resolveQuantity = (quantity: number | null | undefined): number => {
  if (quantity && quantity > 0) return quantity;
  throw new MissingQuantityError("Cada item necesita una cantidad válida");
};

// El subtotal es siempre precio_por_unidad × cantidad, sin importar el
// modo — los 4 precios de catálogo son tarifas por volumen (mientras más
// grande el modo, más barato el precio unitario suele ser), no precios de
// un lote cerrado (pedido explícito del usuario, confirmado con ejemplos:
// millar S/700 × 850 = S/595,000; medio millar S/500 × 5 = S/2,500).
const computeItemSubtotal = (unitPrice: number, quantity: number) => unitPrice * quantity;

// Precio de catálogo del producto según el modo elegido para el item — el
// controller/validator ya garantizó que el producto tiene ese precio
// cargado (o que se mandó pricing_mode="custom" con un custom_price).
const CATALOG_PRICE_FIELD: Record<
  Exclude<QuotationItemPricingMode, "custom">,
  "price_unit" | "price_hundred" | "price_half_thousand" | "price_thousand"
> = {
  unit: "price_unit",
  hundred: "price_hundred",
  half_thousand: "price_half_thousand",
  thousand: "price_thousand",
};

class MissingProductPriceError extends Error {}

const resolveBasePrice = (
  product: ProductModel,
  pricingMode: CreateQuotationItemInput["pricing_mode"],
  customPrice: number | null | undefined
) => {
  if (pricingMode === "custom") {
    if (customPrice === null || customPrice === undefined) {
      throw new MissingProductPriceError(`El item de "${product.name}" necesita un precio personalizado`);
    }
    return Number(customPrice);
  }

  const field = CATALOG_PRICE_FIELD[pricingMode];
  const price = product[field];
  if (price === null || price === undefined) {
    throw new MissingProductPriceError(`El producto "${product.name}" no tiene cargado un precio ${pricingMode}`);
  }
  return Number(price);
};

// `valid_until` es DATEONLY (solo fecha, sin hora) — se devuelve como
// "YYYY-MM-DD" para que coincida con el tipo que ya declara
// QuotationAttributes (string | null), igual que cuando lo manda el body.
// Se cuenta desde el día de emisión EN LIMA: antes se tomaba el día UTC, así
// que una cotización emitida después de las 7 p. m. arrancaba a contar desde
// "mañana" y quedaba vigente un día de más.
const computeDefaultValidUntil = async (createdAt: Date, companyId: number): Promise<string> => {
  const days = await getQuotationValidityDays(companyId);
  return addDaysToDateOnly(toBusinessDateOnly(createdAt), days);
};

const createQuotation = async ({ input, createdBy }: { input: CreateQuotationInput; createdBy?: number }) => {
  const transaction = await DataBase.instance.sequelize.transaction();

  try {
    const client = await DataBase.instance.client.findOne({ where: { id: input.client_id }, transaction });
    if (!client) throw new Error(`El cliente ${input.client_id} no existe`);
    if (client.company_id !== input.company_id) {
      throw new TenantMismatchError("El cliente seleccionado no pertenece a esta empresa");
    }
    if (client.is_deleted) {
      throw new DisabledCatalogEntityError(`El cliente "${client.name}" está deshabilitado`);
    }

    if (input.business_unit_id) {
      const businessUnit = await DataBase.instance.business_unit.findOne({
        where: { id: input.business_unit_id },
        transaction,
      });
      if (!businessUnit) throw new Error(`La tienda ${input.business_unit_id} no existe`);
      if (businessUnit.company_id !== input.company_id) {
        throw new TenantMismatchError("La tienda seleccionada no pertenece a esta empresa");
      }
    }

    const productIds = input.items.map((item) => item.product_id);
    const techniqueIds = input.items.map((item) => item.technique_id).filter((id): id is number => Boolean(id));

    const [products, techniques] = await Promise.all([
      DataBase.instance.product.findAll({ where: { id: productIds }, transaction }),
      techniqueIds.length > 0
        ? DataBase.instance.customization_technique.findAll({ where: { id: techniqueIds }, transaction })
        : Promise.resolve([]),
    ]);

    const itemsWithPricing = input.items.map((item) => {
      const product = products.find((row: ProductModel) => row.id === item.product_id);
      if (!product) throw new Error(`El producto ${item.product_id} no existe`);
      if (product.company_id !== input.company_id) {
        throw new TenantMismatchError(`El producto "${product.name}" no pertenece a esta empresa`);
      }
      if (product.is_deleted) {
        throw new DisabledCatalogEntityError(`El producto "${product.name}" está deshabilitado`);
      }

      const technique = techniques.find((row: CustomizationTechniqueModel) => row.id === item.technique_id);
      if (!technique) throw new Error(`La técnica ${item.technique_id} no existe`);
      if (technique.company_id !== input.company_id) {
        throw new TenantMismatchError(`La técnica "${technique.name}" no pertenece a esta empresa`);
      }
      if (technique.is_deleted) {
        throw new DisabledCatalogEntityError(`La técnica "${technique.name}" está deshabilitada`);
      }

      const quantity = resolveQuantity(item.quantity);
      const basePrice = resolveBasePrice(product, item.pricing_mode, item.custom_price);
      // Se redondea el precio unitario ANTES de multiplicar para que
      // "precio unitario × cantidad = subtotal" cuadre exactamente con lo
      // que ve el cliente en el PDF — si se redondeara solo al final, un
      // precio con técnica porcentual (ej. 12.345) mostraría 12.35 pero
      // multiplicaría por 12.345 y el total no cerraría a mano.
      const unitPrice = roundMoney(resolveUnitPrice(basePrice, technique, item.pricing_mode, item.custom_technique_price));
      const subtotal = roundMoney(computeItemSubtotal(unitPrice, quantity));

      return { ...item, quantity, unit_price: unitPrice, subtotal };
    });

    const subtotal = roundMoney(itemsWithPricing.reduce((sum, item) => sum + item.subtotal, 0));
    const igvRate = await getIgvRate(input.company_id);
    const total = roundMoney(computeQuotationTotal(subtotal, Boolean(input.includes_igv), igvRate));

    // Cada item arranca en la primera etapa de producción de la empresa
    // (globales + propias, ordenadas) — si aún no hay ninguna configurada,
    // queda sin etapa (null) y el kanban del drawer simplemente no la muestra.
    const stages = await getOrderedProductionStages(input.company_id, transaction);
    const firstStage = stages[0] ?? null;

    // Vigencia: si no se manda explícita (el formulario de crear no la
    // pide), se calcula sola a partir de la configuración de la empresa
    // (o el estándar global de 5 días si no configuró nada, ver
    // getQuotationValidityDays) — antes esto quedaba en null siempre y la
    // cotización nunca vencía sola (pedido explícito del usuario).
    const createdAt = nowUtc();
    const validUntil =
      input.valid_until ?? (await computeDefaultValidUntil(createdAt, input.company_id));

    const quotation = await DataBase.instance.quotation.create(
      {
        id: 0,
        company_id: input.company_id,
        business_unit_id: input.business_unit_id ?? null,
        client_id: input.client_id,
        status: "pending",
        subtotal,
        total,
        total_paid: 0,
        includes_delivery: Boolean(input.includes_delivery),
        includes_design: Boolean(input.includes_design),
        includes_igv: Boolean(input.includes_igv),
        notes: input.notes ?? null,
        valid_until: validUntil,
        billing_name: input.billing_name ?? null,
        billing_document_number: input.billing_document_number ?? null,
        production_days: input.production_days ?? null,
        is_deleted: false,
        created_by: createdBy ?? null,
        created_at: createdAt,
        updated_by: null,
        updated_at: null,
      },
      { transaction }
    );

    await DataBase.instance.quotation_item.bulkCreate(
      itemsWithPricing.map((item) => ({
        id: 0,
        quotation_id: quotation.id,
        product_id: item.product_id,
        technique_id: item.technique_id ?? null,
        stage_id: firstStage ? firstStage.id : null,
        quantity: item.quantity,
        pricing_mode: item.pricing_mode,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        created_by: createdBy,
        created_at: nowUtc(),
      })),
      { transaction }
    );

    // El evento va DENTRO de la transacción: si falla al escribirlo, la
    // cotización tampoco se guarda. Antes iba después del commit, así que
    // un fallo acá dejaba una cotización sin su evento "created" y el
    // timeline arrancaba vacío (inconsistencia silenciosa, irreparable
    // sin tocar la BD a mano).
    await logQuotationEvent({
      quotationId: quotation.id,
      action: "created",
      description: `Cotización creada con ${input.items.length} producto(s)`,
      actorId: createdBy,
      transaction,
    });

    await transaction.commit();

    return quotation;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export { createQuotation, MissingProductPriceError, MissingQuantityError };

