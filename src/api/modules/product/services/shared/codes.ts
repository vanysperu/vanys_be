import { Op, Transaction, UniqueConstraintError, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { ProductCodeAttributes } from "../../model/product_code.model";

export const MAX_PRODUCT_CODES = 50;

export interface ProductCodeInput {
  code: string;
  // Proveedor del módulo Proveedores (Sprint 2). Si no llega pero llega el
  // texto `supplier` (integraciones viejas), se busca o se crea por nombre.
  supplier_id?: number | null;
  supplier?: string | null;
  // Nombre de uno de los colores del producto.
  color?: string | null;
}

export interface ProductCodeDto {
  code: string;
  supplier_id: number | null;
  supplier: string | null;
  color: string | null;
}

const codeTaken = (message: string) => new AppError(409, message, undefined, "PRODUCT_CODE_TAKEN");

const trimmedOrNull = (value: string | null | undefined) => value?.trim() || null;

// Códigos sin espacios sobrantes y con su proveedor ya resuelto, en el orden
// que llegaron. Decisión D6: el mismo código puede repetirse con OTRO
// proveedor, pero no dos veces con el mismo (ni con otras mayúsculas): se
// rechaza en vez de descartarlo en silencio.
export const assertNoRepeatedCodes = (codes: ProductCodeDto[]): void => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const entry of codes) {
    const key = `${entry.supplier_id ?? 0}|${entry.code.toUpperCase()}`;
    if (seen.has(key)) repeated.add(entry.code);
    seen.add(key);
  }
  if (repeated.size > 0) {
    throw new AppError(400, `Códigos repetidos con el mismo proveedor: ${[...repeated].join(", ")}`, undefined, "DUPLICATE_PRODUCT_CODE");
  }
};

// Proveedor de cada código: por id (tiene que ser de la empresa) o, si solo
// llega el nombre (integraciones), el de ese nombre o uno nuevo. Una sola
// consulta por tipo, sin N+1.
export async function resolveCodeSuppliers({
  companyId,
  codes,
  actorId,
  transaction,
}: {
  companyId: number;
  codes: ProductCodeInput[];
  actorId: number | null;
  transaction: Transaction;
}): Promise<ProductCodeDto[]> {
  const entries = codes
    .map((entry) => ({
      code: entry.code.trim(),
      supplierId: entry.supplier_id ? Number(entry.supplier_id) : null,
      supplierName: trimmedOrNull(entry.supplier),
      color: trimmedOrNull(entry.color),
    }))
    .filter((entry) => entry.code !== "");

  const ids = [...new Set(entries.flatMap((entry) => (entry.supplierId ? [entry.supplierId] : [])))];
  const byId = new Map<number, string>();
  if (ids.length > 0) {
    const rows = await DataBase.instance.supplier.findAll({
      where: { id: { [Op.in]: ids }, company_id: companyId },
      attributes: ["id", "name"],
      transaction,
    });
    rows.forEach((row) => byId.set(Number(row.id), row.name));
    const missing = ids.find((id) => !byId.has(id));
    if (missing) throw new AppError(400, "Uno de los proveedores no existe en esta empresa", undefined, "SUPPLIER_NOT_FOUND");
  }

  const names = [...new Set(entries.flatMap((entry) => (!entry.supplierId && entry.supplierName ? [entry.supplierName] : [])))];
  const byName = await findOrCreateSuppliersByName(companyId, names, actorId, transaction);

  return entries.map((entry) => {
    if (entry.supplierId) return { code: entry.code, supplier_id: entry.supplierId, supplier: byId.get(entry.supplierId) ?? null, color: entry.color };
    if (!entry.supplierName) return { code: entry.code, supplier_id: null, supplier: null, color: entry.color };
    const supplier = byName.get(entry.supplierName.toUpperCase());
    return { code: entry.code, supplier_id: supplier?.id ?? null, supplier: supplier?.name ?? entry.supplierName, color: entry.color };
  });
}

// Busca proveedores por nombre (sin distinguir mayúsculas) y crea los que falten.
async function findOrCreateSuppliersByName(
  companyId: number,
  names: string[],
  actorId: number | null,
  transaction: Transaction
): Promise<Map<string, { id: number; name: string }>> {
  const byName = new Map<string, { id: number; name: string }>();
  if (names.length === 0) return byName;

  const existing = await DataBase.instance.supplier.findAll({
    where: { company_id: companyId, name: { [Op.in]: names } },
    attributes: ["id", "name"],
    transaction,
  });
  existing.forEach((row) => byName.set(row.name.toUpperCase(), { id: Number(row.id), name: row.name }));

  const now = nowUtc();
  for (const name of names) {
    if (byName.has(name.toUpperCase())) continue;
    const created = await DataBase.instance.supplier.create(
      {
        id: 0,
        company_id: companyId,
        document_type: null,
        document_number: null,
        name,
        trade_name: null,
        email: null,
        phone: null,
        address: null,
        is_carrier: false,
        mtc_registration: null,
        active: true,
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      },
      { transaction }
    );
    byName.set(name.toUpperCase(), { id: Number(created.id), name });
  }
  return byName;
}

const describeProduct = (product: { name: string; sku: string | null } | null | undefined) =>
  product ? `"${product.name}"${product.sku ? ` (SKU ${product.sku})` : ""}` : "otro producto";

/**
 * Un código identifica a UN solo producto por proveedor dentro de la empresa
 * (D6): no puede estar con el mismo proveedor en otro producto, ni ser el SKU
 * de otro (la búsqueda por código devolvería otro producto). Entre empresas
 * distintas sí puede repetirse. `productId` null = producto nuevo.
 */
export async function assertCodesAvailable({
  companyId,
  productId,
  codes,
  transaction,
}: {
  companyId: number;
  productId: number | null;
  codes: Pick<ProductCodeDto, "code" | "supplier_id">[];
  transaction: Transaction;
}): Promise<void> {
  if (codes.length === 0) return;
  const otherProduct: WhereOptions<ProductCodeAttributes> = productId === null ? {} : { product_id: { [Op.ne]: productId } };

  const usedAsCode = await DataBase.instance.product_code.findOne({
    where: {
      [Op.and]: [
        { company_id: companyId },
        otherProduct,
        { [Op.or]: codes.map((entry) => ({ code: entry.code, supplier_id: entry.supplier_id })) },
      ],
    },
    attributes: ["code", "product_id", "supplier"],
    transaction,
  });
  if (usedAsCode) {
    const owner = await DataBase.instance.product.findByPk(usedAsCode.product_id, { attributes: ["name", "sku"], transaction });
    const supplierText = usedAsCode.supplier ? ` con el proveedor "${usedAsCode.supplier}"` : "";
    throw codeTaken(`El código "${usedAsCode.code}"${supplierText} ya pertenece a ${describeProduct(owner)}`);
  }

  const usedAsSku = await DataBase.instance.product.findOne({
    where: {
      company_id: companyId,
      sku: { [Op.in]: codes.map((entry) => entry.code) },
      ...(productId === null ? {} : { id: { [Op.ne]: productId } }),
    },
    attributes: ["name", "sku"],
    transaction,
  });
  if (usedAsSku) throw codeTaken(`El código "${usedAsSku.sku}" es el SKU de ${describeProduct(usedAsSku)}`);
}

// Al revés: el SKU de un producto no puede ser el código de proveedor de OTRO
// producto de la empresa (con ningún proveedor).
export async function assertSkuNotUsedAsCode({
  companyId,
  productId,
  sku,
  transaction,
}: {
  companyId: number;
  productId: number | null;
  sku: string | null | undefined;
  transaction: Transaction;
}): Promise<void> {
  if (!sku) return;
  const usedAsCode = await DataBase.instance.product_code.findOne({
    where: { company_id: companyId, code: sku, ...(productId === null ? {} : { product_id: { [Op.ne]: productId } }) },
    attributes: ["product_id"],
    transaction,
  });
  if (!usedAsCode) return;
  const owner = await DataBase.instance.product.findByPk(usedAsCode.product_id, { attributes: ["name", "sku"], transaction });
  throw codeTaken(`El SKU "${sku}" ya es un código de proveedor de ${describeProduct(owner)}`);
}

// Nombres de los colores que tiene hoy el producto (ya guardados).
const loadColorNames = async (productId: number, transaction: Transaction): Promise<string[]> => {
  const rows = await DataBase.instance.product_color.findAll({
    where: { product_id: productId },
    attributes: ["name"],
    transaction,
  });
  return rows.map((row) => row.name);
};

// Un código solo se vincula a un color que el producto tiene. Devuelve los
// códigos con el nombre del color tal como está guardado (sin importar
// mayúsculas). `colorNames` debe reflejar los colores ya actualizados.
const linkCodesToColors = (codes: ProductCodeDto[], colorNames: string[]): ProductCodeDto[] => {
  const byKey = new Map(colorNames.map((name) => [name.toUpperCase(), name]));
  return codes.map((entry) => {
    if (!entry.color) return entry;
    const color = byKey.get(entry.color.toUpperCase());
    if (!color) {
      throw new AppError(400, `El código "${entry.code}" apunta al color "${entry.color}", que el producto no tiene`, undefined, "CODE_COLOR_NOT_FOUND");
    }
    return { ...entry, color };
  });
};

// Si cambian los colores y no llega la lista de códigos, los códigos que
// apuntaban a un color que ya no existe quedan sin color (el código sigue).
export async function detachRemovedColors(productId: number, transaction: Transaction): Promise<void> {
  const colorNames = await loadColorNames(productId, transaction);
  await DataBase.instance.product_code.update(
    { color: null },
    {
      where: {
        product_id: productId,
        color: colorNames.length > 0 ? { [Op.notIn]: colorNames } : { [Op.ne]: null },
      },
      transaction,
    }
  );
}

// Reemplaza la lista completa de códigos del producto (es su detalle). Va
// dentro de la transacción del llamador y DESPUÉS de guardar los colores.
export async function replaceProductCodes({
  productId,
  companyId,
  codes,
  actorId,
  transaction,
}: {
  productId: number;
  companyId: number;
  codes: ProductCodeInput[];
  actorId: number | null;
  transaction: Transaction;
}): Promise<void> {
  const resolved = await resolveCodeSuppliers({ companyId, codes, actorId, transaction });
  assertNoRepeatedCodes(resolved);
  const normalized = linkCodesToColors(resolved, await loadColorNames(productId, transaction));
  await assertCodesAvailable({ companyId, productId, codes: normalized, transaction });

  await DataBase.instance.product_code.destroy({ where: { product_id: productId }, transaction });
  if (normalized.length === 0) return;

  const now = nowUtc();
  try {
    await DataBase.instance.product_code.bulkCreate(
      normalized.map((entry, index) => ({
        id: 0,
        company_id: companyId,
        product_id: productId,
        code: entry.code,
        supplier_id: entry.supplier_id,
        supplier: entry.supplier,
        color: entry.color,
        position: index,
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      })),
      { transaction }
    );
  } catch (error) {
    // Dos guardados simultáneos con el mismo código y proveedor: el índice
    // único de la base (company_id, supplier_key, code) frena al segundo.
    if (error instanceof UniqueConstraintError) throw codeTaken("Uno de los códigos ya lo usa otro producto con el mismo proveedor");
    throw error;
  }
}

// Códigos de varios productos en UNA consulta (sin N+1 en los listados).
export async function loadCodesByProduct(productIds: number[]): Promise<Map<number, ProductCodeDto[]>> {
  const byProduct = new Map<number, ProductCodeDto[]>();
  if (productIds.length === 0) return byProduct;

  const rows = await DataBase.instance.product_code.findAll({
    where: { product_id: { [Op.in]: productIds } },
    attributes: ["product_id", "code", "supplier_id", "supplier", "color"],
    order: [
      ["product_id", "ASC"],
      ["position", "ASC"],
    ],
  });
  for (const row of rows) {
    const productId = Number(row.product_id);
    const list = byProduct.get(productId) ?? [];
    list.push({
      code: row.code,
      supplier_id: row.supplier_id === null ? null : Number(row.supplier_id),
      supplier: row.supplier,
      color: row.color,
    });
    byProduct.set(productId, list);
  }
  return byProduct;
}
