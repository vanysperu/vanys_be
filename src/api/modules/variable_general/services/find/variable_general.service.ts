import { Op, WhereOptions } from "sequelize";
import { resolveIsDeletedFilter } from "../../../../../core/utils/listFilters";
import { DataBase } from "../../../../../database";
import { VariableGeneralAttributes, VariableGeneralModel } from "../../models/variable_general.model";
import { buildPaginationMeta, getOffset } from "../../../../../core/utils/paginate";

export interface VariableGeneralListQuery {
  filter: {
    search?: string;
    category?: string;
    // Empresa del usuario autenticado; null = usuario is_system, ve todas las empresas.
    companyId?: number | null;
    // Filtros por columna de la pantalla de administración.
    title?: string;
    name?: string;
    status?: string;
  };
  pagination: {
    page: number | undefined;
    limit: number | undefined;
  };
  ignorePagination: boolean;
  // orderBy/orderDir: solo aplica en adminView (la pantalla de gestión); el
  // modo "select" se queda con su orden fijo por id, no es una tabla.
  orderBy?: string;
  orderDir?: "asc" | "desc";
  // El listado por defecto solo devuelve {value, name} (para poblar <select>
  // en otros formularios). La pantalla de administración necesita el
  // registro completo (incluido el id, sin el cual no se puede editar ni
  // eliminar) más el total real para paginar -- por eso es un modo aparte,
  // no se reemplaza el comportamiento anterior para no romper esos <select>.
  adminView?: boolean;
}

const buildWhere = (filter: VariableGeneralListQuery["filter"]): WhereOptions<VariableGeneralAttributes> => {
  const where: WhereOptions<VariableGeneralAttributes> = {};
  // Cada condición compuesta (OR) se acumula acá y se combina con AND real
  // vía Op.and — usar [Op.or] como propiedad más de una vez en el mismo
  // objeto pisaría la asignación anterior (misma clave Symbol), rompiendo
  // el aislamiento por empresa en cuanto se combinara con una búsqueda.
  const andConditions: WhereOptions<VariableGeneralAttributes>[] = [];

  // 🔹 Aislamiento por empresa + variables globales (company_id NULL): una
  // empresa ve las suyas propias y las globales, nunca las de otra empresa.
  // is_system (companyId null/undefined acá) no filtra, ve todo.
  if (filter.companyId !== null && filter.companyId !== undefined) {
    andConditions.push({ [Op.or]: [{ company_id: filter.companyId }, { company_id: null }] });
  }

  // 🔹 Filtro por nombre (LIKE en "name" o "title")
  if (filter.search) {
    andConditions.push({
      [Op.or]: [
        { name: { [Op.like]: `%${filter.search}%` } },
        { title: { [Op.like]: `%${filter.search}%` } },
      ],
    });
  }

  // 🔹 Filtro por categoría
  if (filter.category) {
    where.category = filter.category;
  }

  // 🔹 Filtros por columna de la pantalla de administración.
  if (filter.title) {
    andConditions.push({ title: { [Op.like]: `%${filter.title}%` } });
  }
  if (filter.name) {
    andConditions.push({ name: { [Op.like]: `%${filter.name}%` } });
  }
  const isDeleted = resolveIsDeletedFilter(filter.status);
  if (isDeleted !== undefined) where.is_deleted = isDeleted;

  if (andConditions.length > 0) {
    return { ...where, [Op.and]: andConditions };
  }

  return where;
};

export const getVariableGeneralList = async ({
  filter,
  pagination,
  ignorePagination = false,
  adminView = false,
  orderBy,
  orderDir,
}: VariableGeneralListQuery) => {
  const where = buildWhere(filter);

  if (adminView) {
    // Límite/página con los mismos defaults del validador reusable
    // (CLAUDE.md sección 4): limit default 20 (antes 10), page default 1.
    const limit = pagination?.limit || 20;
    const page = pagination?.page || 1;
    // Ordenamiento por columna elegido en la tabla; por defecto se mantiene
    // el orden histórico (id DESC) si no se manda orderBy.
    const resolvedOrder: [string, "asc" | "desc"] = orderBy ? [orderBy, orderDir ?? "desc"] : ["id", "desc"];

    const { count, rows } = await DataBase.instance.variable_general.findAndCountAll({
      where,
      order: [resolvedOrder],
      ...(ignorePagination ? {} : { limit, offset: getOffset(page, limit) }),
    });

    return { data: rows, meta: buildPaginationMeta(count, page, limit) };
  }

  const results = await DataBase.instance.variable_general.findAll({
    where,
    attributes: ["name", "prefix_id"], // solo traemos estas dos columnas
    order: [["id", "DESC"]],
    ...(ignorePagination
      ? {}
      : {
          limit: pagination?.limit,
          offset: ((pagination?.page || 1) - 1) * (pagination?.limit || 10),
        }),
  });

  // 🔹 Transformamos los resultados al formato deseado
  return results.map((item: VariableGeneralModel) => ({
    value: item.prefix_id,
    name: item.name,
  }));
};

// companyId=null (is_system) omite el filtro de tenant. Sin este chequeo,
// cualquier usuario autenticado con acceso al módulo podía leer por id el
// detalle de una variable general de OTRA empresa (el listado sí filtraba
// por company_id, pero el detalle por id nunca lo hacía — IDOR de lectura).
export const findVariableGeneralById = async (id: number, companyId: number | null) => {
  const model = DataBase.instance.variable_general;
  const item = await model.findByPk(id);
  if (!item) return null;
  if (companyId !== null && item.company_id !== null && item.company_id !== companyId) return null;
  return item;
};
