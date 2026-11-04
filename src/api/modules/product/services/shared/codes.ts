import { Op, Transaction, UniqueConstraintError } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";

export const MAX_PRODUCT_CODES = 50;

export interface ProductCodeInput {
  code: string;
  supplier?: string | null;
}

export interface ProductCodeDto {
  code: string;
  supplier: string | null;
}

const codeTaken = (message: string) => new AppError(409, message, undefined, "PRODUCT_CODE_TAKEN");

// Códigos sin espacios sobrantes, en el orden que llegaron. Un código NO puede
// repetirse (pedido explícito del usuario), ni siquiera con otro proveedor ni
// con otras mayúsculas: se rechaza en vez de descartarlo en silencio.
export const normalizeCodes = (codes: ProductCodeInput[]): ProductCodeDto[] => {
  const normalized = codes
    .map((entry) => ({ code: entry.code.trim(), supplier: entry.supplier?.trim() || null }))
    .filter((entry) => entry.code !== "");

  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const entry of normalized) {
    const key = entry.code.toUpperCase();
    if (seen.has(key)) repeated.add(entry.code);
    seen.add(key);
  }
  if (repeated.size > 0) {
    throw new AppError(400, `Códigos repetidos en el producto: ${[...repeated].join(", ")}`, undefined, "DUPLICATE_PRODUCT_CODE");
  }
  return normalized;
};

const describeProduct = (product: { name: string; sku: string | null } | null | undefined) =>
  product ? `"${product.name}"${product.sku ? ` (SKU ${product.sku})` : ""}` : "otro producto";

/**
 * Un código identifica a UN solo producto de la empresa: no puede estar en los
 * códigos de otro producto, ni ser el SKU de otro (la búsqueda por código
 * devolvería dos productos). Entre empresas distintas sí puede repetirse.
 * `productId` null = producto nuevo.
 */
export async function assertCodesAvailable({
  companyId,
  productId,
  codes,
  transaction,
}: {
  companyId: number;
  productId: number | null;
  codes: string[];
  transaction: Transaction;
}): Promise<void> {
  if (codes.length === 0) return;
  const otherProduct = productId === null ? {} : { [Op.ne]: productId };

  const usedAsCode = await DataBase.instance.product_code.findOne({
    where: { company_id: companyId, code: { [Op.in]: codes }, ...(productId === null ? {} : { product_id: otherProduct }) },
    attributes: ["code", "product_id"],
    transaction,
  });
  if (usedAsCode) {
    const owner = await DataBase.instance.product.findByPk(usedAsCode.product_id, { attributes: ["name", "sku"], transaction });
    throw codeTaken(`El código "${usedAsCode.code}" ya pertenece a ${describeProduct(owner)}`);
  }

  const usedAsSku = await DataBase.instance.product.findOne({
    where: { company_id: companyId, sku: { [Op.in]: codes }, ...(productId === null ? {} : { id: otherProduct }) },
    attributes: ["name", "sku"],
    transaction,
  });
  if (usedAsSku) throw codeTaken(`El código "${usedAsSku.sku}" es el SKU de ${describeProduct(usedAsSku)}`);
}

// Al revés: el SKU de un producto no puede ser el código de proveedor de OTRO
// producto de la empresa.
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

// Reemplaza la lista completa de códigos del producto (es su detalle). Va
// dentro de la transacción del llamador.
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
  const normalized = normalizeCodes(codes);
  await assertCodesAvailable({ companyId, productId, codes: normalized.map((entry) => entry.code), transaction });

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
        supplier: entry.supplier,
        position: index,
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      })),
      { transaction }
    );
  } catch (error) {
    // Dos guardados simultáneos con el mismo código: el índice único de la
    // base (company_id, code) frena al segundo.
    if (error instanceof UniqueConstraintError) throw codeTaken("Uno de los códigos ya lo usa otro producto de la empresa");
    throw error;
  }
}

// Códigos de varios productos en UNA consulta (sin N+1 en los listados).
export async function loadCodesByProduct(productIds: number[]): Promise<Map<number, ProductCodeDto[]>> {
  const byProduct = new Map<number, ProductCodeDto[]>();
  if (productIds.length === 0) return byProduct;

  const rows = await DataBase.instance.product_code.findAll({
    where: { product_id: { [Op.in]: productIds } },
    attributes: ["product_id", "code", "supplier"],
    order: [
      ["product_id", "ASC"],
      ["position", "ASC"],
    ],
  });
  for (const row of rows) {
    const productId = Number(row.product_id);
    const list = byProduct.get(productId) ?? [];
    list.push({ code: row.code, supplier: row.supplier });
    byProduct.set(productId, list);
  }
  return byProduct;
}
