import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { purgeUnusedCompanyAssets } from "../../../uploads/services/delete/company_asset.service";
import { ProductModel } from "../../model/product.model";
import { resolveProductCategories } from "./catalog";
import { ProductColorInput, replaceProductColors } from "./colors";
import { assertSkuNotUsedAsCode, detachRemovedColors, ProductCodeInput, replaceProductCodes } from "./codes";
import { assertProductImageUsable } from "./images";

// Lo que se puede escribir de un producto, desde la pantalla o la subida
// masiva. `undefined` = no se mandó (al actualizar, se conserva); `null`
// limpia el valor.
export interface ProductWriteInput {
  name?: string;
  description?: string | null;
  sku?: string | null;
  price_unit?: number | null;
  price_hundred?: number | null;
  price_half_thousand?: number | null;
  price_thousand?: number | null;
  requires_customization?: boolean;
  // Pedido mínimo (entero ≥ 1); null = sin mínimo.
  min_order_quantity?: number | null;
  category_id?: number | null;
  subcategory_id?: number | null;
  colors?: ProductColorInput[];
  // Códigos de proveedores (además del SKU, que es uno solo).
  codes?: ProductCodeInput[];
  image_path?: string | null;
}

const PRICE_FIELDS = ["price_unit", "price_hundred", "price_half_thousand", "price_thousand"] as const;

const hasAnyPrice = (values: Partial<Record<(typeof PRICE_FIELDS)[number], number | null | undefined>>) =>
  PRICE_FIELDS.some((field) => values[field] !== undefined && values[field] !== null);

const noPriceError = () =>
  new AppError(
    400,
    "Debes cargar al menos un precio (por unidad, por ciento, medio millar o por millar)",
    undefined,
    "PRICE_REQUIRED"
  );

const toNullablePrice = (value: number | null | undefined) =>
  value === undefined || value === null ? null : Number(value);

// Categoría/subcategoría al ACTUALIZAR: si no llega ninguna, se conservan.
// Cambiar la categoría sin mandar subcategoría la limpia (la vieja colgaba de
// otra categoría); mandar solo la subcategoría toma su categoría.
const nextCategoryArgs = (current: ProductModel, input: ProductWriteInput) => {
  const categoryChanged = input.category_id !== undefined && input.category_id !== current.category_id;
  const subcategoryId =
    input.subcategory_id !== undefined ? input.subcategory_id : categoryChanged ? null : current.subcategory_id;
  const categoryId =
    input.category_id !== undefined ? input.category_id : input.subcategory_id ? undefined : current.category_id;
  return { categoryId, subcategoryId };
};

const touchesCategory = (input: ProductWriteInput) =>
  input.category_id !== undefined || input.subcategory_id !== undefined;

// Un SKU identifica a un solo producto de la empresa: la subida masiva hace
// upsert por SKU, así que un producto deshabilitado también lo ocupa. La
// colación de la columna ya ignora mayúsculas. Va acá y no como índice único
// a propósito: una base con duplicados previos no podría aplicar esa migración
// y la app no arranca si una migración falla. Por eso solo se valida al crear
// o al cambiar el SKU: un duplicado viejo se sigue pudiendo editar.
const assertSkuAvailable = async ({
  companyId,
  productId,
  sku,
  transaction,
}: {
  companyId: number;
  productId: number | null;
  sku: string | null | undefined;
  transaction: Transaction;
}): Promise<void> => {
  if (!sku) return;
  const taken = await DataBase.instance.product.findOne({
    where: { company_id: companyId, sku, ...(productId === null ? {} : { id: { [Op.ne]: productId } }) },
    attributes: ["id", "name", "is_deleted"],
    transaction,
  });
  if (!taken) return;
  const owner = taken.is_deleted ? `el producto deshabilitado "${taken.name}"` : `el producto "${taken.name}"`;
  throw new AppError(409, `El SKU ${sku} ya lo usa ${owner}`, undefined, "DUPLICATE_SKU");
};

/** Crea un producto de `companyId` con sus colores, en la transacción dada. */
export async function createProductRecord({
  companyId,
  input,
  actorId,
  transaction,
}: {
  companyId: number;
  input: ProductWriteInput;
  actorId: number | null;
  transaction: Transaction;
}): Promise<ProductModel> {
  if (!input.name?.trim()) throw new AppError(400, "El nombre es obligatorio", undefined, "NAME_REQUIRED");
  if (!hasAnyPrice(input)) throw noPriceError();

  const categories = await resolveProductCategories({
    companyId,
    categoryId: input.category_id,
    subcategoryId: input.subcategory_id,
    transaction,
  });
  if (input.image_path) await assertProductImageUsable(input.image_path, companyId, transaction);
  await assertSkuAvailable({ companyId, productId: null, sku: input.sku, transaction });
  // El SKU no puede ser el código de proveedor de otro producto.
  await assertSkuNotUsedAsCode({ companyId, productId: null, sku: input.sku, transaction });

  const now = nowUtc();
  // Lista blanca explícita — nunca `...input`: el body podía traer `id`,
  // `is_deleted` o columnas de auditoría.
  const product = await DataBase.instance.product.create(
    {
      id: 0,
      company_id: companyId,
      name: input.name.trim(),
      description: input.description ?? null,
      // "" (campo vacío) se guarda como null: sin SKU.
      sku: input.sku || null,
      price_unit: toNullablePrice(input.price_unit),
      price_hundred: toNullablePrice(input.price_hundred),
      price_half_thousand: toNullablePrice(input.price_half_thousand),
      price_thousand: toNullablePrice(input.price_thousand),
      // Apagado por defecto (decisión del usuario): la mayoría no se personaliza.
      requires_customization: input.requires_customization ?? false,
      min_order_quantity: input.min_order_quantity ?? null,
      category_id: categories.category_id,
      subcategory_id: categories.subcategory_id,
      image_path: input.image_path || null,
      is_deleted: false,
      created_by: actorId,
      created_at: now,
      updated_by: null,
      updated_at: null,
    },
    { transaction }
  );

  if (input.colors) {
    await replaceProductColors({ productId: product.id, companyId, colors: input.colors, actorId, transaction });
  }
  if (input.codes) {
    await replaceProductCodes({ productId: product.id, companyId, codes: input.codes, actorId, transaction });
  }
  return product;
}

/**
 * Actualiza solo lo que llegó. Nunca cambia `company_id`. Si se reemplaza o
 * quita la foto, la anterior se borra en la misma transacción (si ya no la usa
 * nada más de la empresa).
 */
export async function updateProductRecord({
  product,
  input,
  actorId,
  transaction,
}: {
  product: ProductModel;
  input: ProductWriteInput;
  actorId: number | null;
  transaction: Transaction;
}): Promise<void> {
  const companyId = Number(product.company_id);
  const nextPrices = Object.fromEntries(
    PRICE_FIELDS.map((field) => [field, input[field] !== undefined ? input[field] : product[field]])
  ) as Record<(typeof PRICE_FIELDS)[number], number | null>;
  if (!hasAnyPrice(nextPrices)) throw noPriceError();

  const categories = touchesCategory(input)
    ? await resolveProductCategories({ companyId, ...nextCategoryArgs(product, input), transaction })
    : null;

  const changesSku = input.sku !== undefined && (input.sku || null) !== product.sku;
  if (changesSku) {
    await assertSkuAvailable({ companyId, productId: Number(product.id), sku: input.sku, transaction });
    await assertSkuNotUsedAsCode({ companyId, productId: Number(product.id), sku: input.sku, transaction });
  }

  const replacesImage = input.image_path !== undefined && (input.image_path || null) !== product.image_path;
  if (replacesImage && input.image_path) await assertProductImageUsable(input.image_path, companyId, transaction);

  await DataBase.instance.product.update(
    {
      name: input.name === undefined ? product.name : input.name.trim(),
      description: input.description === undefined ? product.description : input.description,
      // "" (campo vacío) borra el SKU.
      sku: input.sku === undefined ? product.sku : input.sku || null,
      price_unit: toNullablePrice(nextPrices.price_unit),
      price_hundred: toNullablePrice(nextPrices.price_hundred),
      price_half_thousand: toNullablePrice(nextPrices.price_half_thousand),
      price_thousand: toNullablePrice(nextPrices.price_thousand),
      requires_customization: input.requires_customization ?? product.requires_customization,
      // undefined = no se mandó (se conserva); null = sin mínimo.
      min_order_quantity: input.min_order_quantity === undefined ? product.min_order_quantity : input.min_order_quantity,
      category_id: categories ? categories.category_id : product.category_id,
      subcategory_id: categories ? categories.subcategory_id : product.subcategory_id,
      image_path: replacesImage ? input.image_path || null : product.image_path,
      updated_by: actorId,
      updated_at: nowUtc(),
    },
    { where: { id: product.id }, transaction }
  );

  if (input.colors) {
    await replaceProductColors({ productId: product.id, companyId, colors: input.colors, actorId, transaction });
  }
  if (input.codes) {
    await replaceProductCodes({ productId: product.id, companyId, codes: input.codes, actorId, transaction });
  }
  // Cambiaron los colores pero no los códigos: un código no puede quedar
  // apuntando a un color que ya no existe.
  if (input.colors && !input.codes) await detachRemovedColors(product.id, transaction);
  if (replacesImage && product.image_path) {
    await purgeUnusedCompanyAssets({ companyId, replacedPaths: [product.image_path], transaction });
  }
}
