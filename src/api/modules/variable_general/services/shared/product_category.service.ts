import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { PRODUCT_CATEGORY, PRODUCT_SUBCATEGORY } from "../../../product/services/shared/catalog";
import { VariableGeneralAttributes } from "../../models/variable_general.model";

/**
 * Nombres sin repetir (pedido explícito del usuario: "se están duplicando en
 * el listar"). Solo cuentan las filas ACTIVAS y se compara sin distinguir
 * mayúsculas (colación de MySQL) ni espacios de los extremos:
 * - Categoría de una empresa: no puede llamarse igual que otra de esa empresa
 *   ni que una global (el selector del producto muestra las dos juntas).
 * - Categoría global: no puede llamarse igual que otra global ni que una de
 *   cualquier empresa (esa empresa la vería repetida).
 * - Subcategoría: no puede repetirse dentro de la misma categoría.
 * `id` = la fila que se edita o rehabilita (no choca consigo misma).
 */
export async function assertUniqueProductCategoryName({
  id,
  category,
  name,
  ref1,
  companyId,
}: {
  id: number | null;
  category: string | undefined;
  name: string | undefined;
  ref1: string | null | undefined;
  companyId: number | null;
}): Promise<void> {
  const isCategory = category === PRODUCT_CATEGORY;
  const isSubcategory = category === PRODUCT_SUBCATEGORY;
  const trimmed = name?.trim();
  if ((!isCategory && !isSubcategory) || !trimmed) return;

  const scope: WhereOptions<VariableGeneralAttributes> = isSubcategory
    ? { ref1: String(ref1 ?? "") }
    : companyId === null
      ? {}
      : { [Op.or]: [{ company_id: companyId }, { company_id: null }] };

  const duplicate = await DataBase.instance.variable_general.findOne({
    where: {
      [Op.and]: [
        { category: category as string, name: trimmed, is_deleted: false },
        scope,
        id === null ? {} : { id: { [Op.ne]: id } },
      ],
    },
    attributes: ["id", "company_id"],
  });
  if (!duplicate) return;

  const message = isSubcategory
    ? `Ya existe la subcategoría "${trimmed}" en esa categoría`
    : duplicate.company_id === null
      ? `Ya existe una categoría global "${trimmed}"`
      : `Ya existe la categoría "${trimmed}"${companyId === null ? " en una empresa: una global con ese nombre se vería repetida ahí" : ""}`;
  throw new AppError(409, message, undefined, "DUPLICATE_PRODUCT_CATEGORY");
}

/**
 * Una subcategoría de producto (category = "product_subcategory") guarda en
 * `ref1` el id de su categoría ("product_category"). Antes de guardarla:
 * - ref1 tiene que ser una categoría activa;
 * - del mismo ámbito: una subcategoría global cuelga de una categoría global;
 *   una de empresa, de una global o de una de SU empresa.
 * Así un producto nunca termina con una subcategoría huérfana o ajena.
 */
export async function assertProductSubcategoryParent({
  category,
  ref1,
  companyId,
}: {
  category: string | undefined;
  ref1: string | null | undefined;
  companyId: number | null;
}): Promise<void> {
  if (category !== PRODUCT_SUBCATEGORY) return;

  const parentId = Number(ref1);
  if (!Number.isInteger(parentId) || parentId <= 0) {
    throw new AppError(400, "Elige la categoría a la que pertenece la subcategoría", undefined, "SUBCATEGORY_PARENT_REQUIRED");
  }

  const parent = await DataBase.instance.variable_general.findOne({
    where: { id: parentId, category: PRODUCT_CATEGORY, is_deleted: false },
    attributes: ["id", "company_id"],
  });
  const parentCompanyId = parent?.company_id === null || parent?.company_id === undefined ? null : Number(parent.company_id);
  const sameScope = parentCompanyId === null || parentCompanyId === companyId;
  if (!parent || !sameScope) {
    throw new AppError(
      400,
      "La categoría padre no existe, está deshabilitada o es de otra empresa (una subcategoría global necesita una categoría global)",
      undefined,
      "INVALID_SUBCATEGORY_PARENT"
    );
  }
}
