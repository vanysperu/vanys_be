import { FindAttributeOptions, Transaction, WhereOptions, Order, FindAndCountOptions, Op, literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { RoleAttributes } from "../../model/role.model";
import { resolveIsDeletedFilter } from "../../../../../core/utils/listFilters";
import { IListOptions } from '../../../../interfaces/IListOptions.interface'

interface RoleListOptions extends IListOptions<RoleAttributes> {
  companyId?: number | null;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  name?: string;
  description?: string;
  // "true"/"false" tal como llega del query param — match exacto, no LIKE.
  isSystemFilter?: string;
  // "active"/"inactive" (o ambos) — role.status (true = activo).
  status?: unknown;
}

 const getRolesList = async (
  options?: RoleListOptions
) => {
  try {
    let { where, page, limit, order, companyId, orderBy, orderDir, name, description, isSystemFilter, status } = options || {};

    // Bug corregido: antes era `company_id = companyId` a secas, lo que
    // dejaba FUERA los roles globales/plantilla (company_id NULL, ej.
    // "Administrador"/"Gestor"/"Especialista") para cualquier admin de
    // empresa — si esa empresa no tenía todavía ningún rol propio creado
    // (company_id = la suya), el selector de rol quedaba vacío al crear un
    // usuario (bug reportado: "al admin no le sale roles para crear
    // usuario"). Mismo criterio OR que ya usa variable_general/general_variable
    // (ve las suyas + las globales), is_system (companyId null/undefined
    // acá) sigue viendo todo sin filtro.
    // `is_system: false` es obligatorio en esta rama — sin él, "Super
    // Administrador" (company_id NULL, is_system true) se colaba también
    // por el OR de arriba, y un admin de empresa podría verlo/asignarlo al
    // crear un usuario. Un caller is_system (companyId null/undefined acá)
    // sigue sin ningún filtro, ve absolutamente todo.
    const companyWhere =
      companyId === null || companyId === undefined
        ? {}
        : { [Op.and]: [{ [Op.or]: [{ company_id: companyId }, { company_id: null }] }, { is_system: false }] };
    const nameWhere = name ? { name: { [Op.like]: `%${name}%` } } : {};
    const descriptionWhere = description ? { description: { [Op.like]: `%${description}%` } } : {};
    const isSystemWhere =
      isSystemFilter === "true" || isSystemFilter === "false" ? { is_system: isSystemFilter === "true" } : {};

    // En roles el estado es la columna `status` (true = activo), al revés que
    // el is_deleted de los demás catálogos.
    const isDeleted = resolveIsDeletedFilter(status);
    const statusWhere = isDeleted === undefined ? {} : { status: !isDeleted };

    // orderBy/orderDir (columna elegida en la tabla) tiene prioridad sobre el
    // `order` legacy que ya recibía este service — nunca se pierde el
    // comportamiento anterior si no se manda orderBy.
    const resolvedOrder: Order | undefined = orderBy ? [[orderBy, orderDir ?? "desc"]] : order;

    // Bug real: `status: 1` fijo acá escondía CUALQUIER rol deshabilitado
    // para siempre de este listado — la pantalla muestra una columna
    // "Estado" con badge Activo/Inactivo (como clientes/productos), pero
    // nunca filtra por ella, así que no hay forma de pedir "solo inactivos"
    // ni de volver a encontrar un rol para re-habilitarlo una vez
    // deshabilitado. Se quita, mismo criterio que el resto de catálogos:
    // el listado trae ambos estados, el frontend pinta el badge.
    let queryOptions: FindAndCountOptions<RoleAttributes> = {
      where: { ...where, ...companyWhere, ...nameWhere, ...descriptionWhere, ...isSystemWhere, ...statusWhere },
      attributes: {
        exclude: ["created_by", "updated_by", "updated_at"],
        // Nombre de la empresa dueña del rol (NULL = plantilla compartida):
        // el Super Administrador ve los roles de todas las empresas en una
        // sola tabla y necesita distinguirlos. Subconsulta por PK, sin join
        // que altere el conteo de la paginación.
        include: [[literal("(SELECT c.business_name FROM company c WHERE c.id = role.company_id)"), "company_name"]],
      },
      order: resolvedOrder,
    };

    if (limit && !page) {
      page = 1;
    }

    if (limit && page) {
      queryOptions.offset = (page - 1) * limit;
      queryOptions.limit = limit;
    }

    const { count, rows } = await DataBase.instance.role.findAndCountAll(
      queryOptions
    );

    return { page, count, rows, limit };
  } catch (err) {

    throw err;
  }
};
const getAllRoles = async ({
  where,
  attributes,
}: {
  where?: WhereOptions<RoleAttributes>;
  attributes?: FindAttributeOptions;
}) => {
  try {
    return await DataBase.instance.role.findAll({ where, attributes });
  } catch (error) {
    throw error;
  }
};

export { getAllRoles,getRolesList };
