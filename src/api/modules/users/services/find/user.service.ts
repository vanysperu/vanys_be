import { FindAttributeOptions, QueryTypes, Transaction, WhereOptions } from "sequelize";
import { UserAttributes } from "../../models/user.model";
import { DataBase } from "../../../../../database";
import { IDbUserAccount, IUserAccount } from "../../interfaces/user-account";
import { IDBUserInformation, IUserInformation } from "../../interfaces/user-query-list";
import { paginatedListGenerator } from "../../../../functions/paginatedListGenerator";
import { formatDateForSQL } from "../../../../../utils/formatDateForSQL";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";

export interface UserTenantInfo {
  businessUnitId: number | null;
  companyId: number | null;
  isSystem: boolean;
  userActive: boolean;
  businessUnitDisabled: boolean;
  companyDisabled: boolean;
  mustChangePassword: boolean;
}

/**
 * Resuelve a qué tienda/empresa pertenece un usuario, si alguno de sus roles
 * es de plataforma (is_system) y si el usuario/tienda/empresa están activos.
 * Se consulta por request (no se cachea en el JWT) para poder revocar en
 * caliente: si se deshabilita al usuario, su tienda o su empresa, el efecto
 * es inmediato en la siguiente request, sin esperar a que expire el token.
 */
const getUserTenantInfo = async (userId: number): Promise<UserTenantInfo> => {
  // companyId: si tiene tienda, la empresa de esa tienda manda (bu.company_id);
  // si no tiene tienda (admin de empresa sin tienda propia), cae al
  // company_id directo del usuario — mismo criterio explicado en la
  // migración 20260927100000-add-company-id-to-user.js. companyDisabled
  // revisa la empresa por CUALQUIERA de los dos caminos (c/c2).
  const query = `
    SELECT bu.id AS businessUnitId, COALESCE(bu.company_id, u.company_id) AS companyId,
           COALESCE(MAX(r.is_system), 0) AS isSystem,
           u.status AS userActive,
           COALESCE(bu.is_deleted, false) AS businessUnitDisabled,
           COALESCE(c.is_deleted, c2.is_deleted, false) AS companyDisabled,
           u.must_change_password AS mustChangePassword
    FROM user u
    LEFT JOIN business_unit bu ON u.business_unit_id = bu.id
    LEFT JOIN company c ON bu.company_id = c.id
    LEFT JOIN company c2 ON u.company_id = c2.id
    LEFT JOIN user_role ur ON ur.user_id = u.id
    LEFT JOIN role r ON r.id = ur.role_id AND r.status = true
    WHERE u.id = ?
    GROUP BY u.id, bu.id, bu.company_id, u.company_id, u.status, bu.is_deleted, c.is_deleted, c2.is_deleted, u.must_change_password
  `;

  const rows = (await DataBase.instance.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: [userId],
  })) as {
    businessUnitId: number | null;
    companyId: number | null;
    isSystem: number;
    userActive: number;
    businessUnitDisabled: number;
    companyDisabled: number;
    mustChangePassword: number;
  }[];

  const row = rows[0];

  return {
    businessUnitId: row?.businessUnitId ?? null,
    companyId: row?.companyId ?? null,
    isSystem: Boolean(row?.isSystem),
    userActive: Boolean(row?.userActive),
    businessUnitDisabled: Boolean(row?.businessUnitDisabled),
    companyDisabled: Boolean(row?.companyDisabled),
    mustChangePassword: Boolean(row?.mustChangePassword),
  };
};

export interface UserListFilters {
  fullName?: string | null;
  userStatus?: number;
  startDate?: string | null;
  endDate?: string | null;
  roleId?: number | string | null;
  isActive?: string | null;
  searchTerm?: string | null;
  orderDir?: string;
  orderBy?: string;
  // Filtros por columna de la tabla (buscadores del header de DataTable).
  name?: string | null;
  email?: string | null;
  roleName?: string | null;
}

const getUsersList = async (
  options:
    | { page: number; limit: number; companyId?: number | null; businessUnitId?: number; filters?: UserListFilters }
    | undefined
): Promise<PaginatedResult<Record<string, unknown>>> => {
  try {
    const { page, limit, companyId, businessUnitId, filters } = options || { page: 1, limit: 20 };

    // Todos los filtros opcionales
    const {
      fullName,
      userStatus,
      startDate,
      endDate,
      roleId,
      isActive,
      searchTerm,
      orderDir,
      orderBy,
      name,
      email,
      roleName,
    } = filters || {};

    // Fechas seguras (inicio del día y fin del día)
    const startDateFilter = formatDateForSQL(startDate ?? undefined, false);
    const endDateFilter = formatDateForSQL(endDate ?? undefined, true);

    // 🚨 Definimos SIEMPRE todas las claves, incluso si no se usan
    const replacements = {
      fullName: fullName ?? null,
      userStatus: userStatus ?? -1,
      startDate: startDateFilter,
      endDate: endDateFilter,
      roleId: roleId ?? null,
      isActive: typeof isActive === "string" ? (isActive === "true" ? true : false) : null,
      searchTerm: searchTerm ?? null,
      companyId: companyId ?? null,
      businessUnitId: businessUnitId ?? null,
      order: orderDir,
      sort: orderBy,
      // Filtros por columna (nombre, email, rol) — replacements adicionales
      // de la misma consulta parametrizada, nunca concatenados a mano.
      name: name ?? null,
      email: email ?? null,
      roleName: roleName ?? null,
    };

    const qColumns = `
      u.id, u.name, u.paternal_lastname, u.maternal_lastname,
      u.date_of_birth, u.username, u.email,
      u.status, u.created_at,
      u.document_type, u.document_number, u.gender,
      u.phone_number, u.address, u.login_status,
      u.failed_attempts, u.last_lock_date, u.last_unlock_date,
      u.lockout_minutes, u.device_id, u.recovery_code, u.business_unit_id,
      u.is_deleted, u.created_by, u.updated_at, u.updated_by,
      CONCAT_WS(' ', u.name, u.paternal_lastname, u.maternal_lastname) as fullName,
      CASE
        WHEN u.status = 1 THEN 'Activo'
        WHEN u.status = 0 THEN 'Inactivo'
        ELSE 'No especificado'
      END as status_name,
      dt.name as document_type_name,
      g.name as gender_name,
      r.name as role_name
    `;

    const qSelect = `
      SELECT {{columns}}
      FROM user u
      LEFT JOIN general_variable dt ON u.document_type = dt.prefix_id
      LEFT JOIN general_variable g ON u.gender = g.prefix_id
      INNER JOIN user_role ur ON u.id = ur.user_id
      INNER JOIN role r ON ur.role_id = r.id
      LEFT JOIN business_unit bu ON u.business_unit_id = bu.id
    `;

    // WHERE base — todos los filtros opcionales y seguros
    const qWhere = `
      WHERE 1=1
        -- COALESCE: un admin de empresa sin tienda propia (business_unit_id
        -- null) no debe desaparecer del listado de su empresa solo porque
        -- bu.company_id sale NULL (ver getUserTenantInfo, mismo criterio).
        AND ( :companyId IS NULL OR COALESCE(bu.company_id, u.company_id) = :companyId )
        AND ( :businessUnitId IS NULL OR u.business_unit_id = :businessUnitId )
        AND ( :fullName IS NULL OR :fullName = '' OR LOWER(CONCAT_WS(' ', u.name, u.paternal_lastname, u.maternal_lastname)) LIKE CONCAT('%', LOWER(:fullName), '%') )
        AND ( :userStatus = -1 OR u.status = :userStatus )
        AND ( :isActive IS NULL OR u.status = CASE WHEN :isActive = true THEN 1 ELSE 0 END )
        AND ( :startDate IS NULL OR u.created_at >= :startDate )
        AND ( :endDate IS NULL OR u.created_at <= :endDate )
        AND ( :roleId IS NULL OR :roleId = '' OR ur.role_id = :roleId )
        AND ( :name IS NULL OR :name = '' OR LOWER(CONCAT_WS(' ', u.name, u.paternal_lastname, u.maternal_lastname)) LIKE CONCAT('%', LOWER(:name), '%') )
        AND ( :email IS NULL OR :email = '' OR LOWER(u.email) LIKE CONCAT('%', LOWER(:email), '%') )
        AND ( :roleName IS NULL OR :roleName = '' OR LOWER(r.name) LIKE CONCAT('%', LOWER(:roleName), '%') )
        AND (
          :searchTerm IS NULL OR :searchTerm = '' OR
          LOWER(u.name) LIKE CONCAT('%', LOWER(:searchTerm), '%') OR
          LOWER(u.paternal_lastname) LIKE CONCAT('%', LOWER(:searchTerm), '%') OR
          LOWER(u.maternal_lastname) LIKE CONCAT('%', LOWER(:searchTerm), '%') OR
          LOWER(u.username) LIKE CONCAT('%', LOWER(:searchTerm), '%') OR
          LOWER(u.email) LIKE CONCAT('%', LOWER(:searchTerm), '%') OR
          LOWER(u.document_number) LIKE CONCAT('%', LOWER(:searchTerm), '%') OR
          LOWER(u.phone_number) LIKE CONCAT('%', LOWER(:searchTerm), '%') OR
          LOWER(u.address) LIKE CONCAT('%', LOWER(:searchTerm), '%') OR
          LOWER(r.name) LIKE CONCAT('%', LOWER(:searchTerm), '%')
        )
    `;

    const qOrderBy = `ORDER BY ${orderBy} ${orderDir}`;

    const result = await paginatedListGenerator({
      structure: {
        qColumns,
        qSelect,
        qWhere,
        qOrderBy,
      },
      limit,
      page,
      replacements,
    });

    // Se adapta la forma legacy de paginatedListGenerator ({ totalCount, pageSize })
    // al contrato estándar { data, meta } (CLAUDE.md sección 4), igual que los
    // otros 9 módulos ya migrados.
    return {
      data: result.data,
      meta: buildPaginationMeta(result.totalCount, page, limit),
    };
  } catch (error) {
    console.error("Error en getUsersList:", error);
    throw error;
  }
};

const findOneUser = async ({
  where,
  attributes,
  transaction,
}: {
  where?: WhereOptions<UserAttributes>;
  attributes?: FindAttributeOptions;
  transaction?: Transaction;
}): Promise<UserAttributes | null> => {
  const user = await DataBase.instance.user.findOne({
    where,
    attributes,
    transaction,
  });

  if (!user) {
    return null;
  }

  return user.get({ plain: true });
};

const getAccountById = async (userId: number): Promise<IUserAccount> => {
  try {
    const query = `
        select u.id, u.username, u.email, u.name, u.paternal_lastname, u.maternal_lastname,
              u.date_of_birth, u.document_type, u.document_number, u.gender,
              u.phone_number, u.address, u.login_status, u.failed_attempts,
              u.last_lock_date, u.last_unlock_date, u.lockout_minutes, u.device_id,
              u.recovery_code, u.business_unit_id, u.is_deleted, u.created_by, u.created_at,
              u.updated_at, u.updated_by, u.status,
              coalesce(json_arrayagg( json_object('id', ur.role_id, 'name', r.name, 'rol', r.key_code)), '[]') roles
        from user u
        left join user_role ur
        on u.id = ur.user_id
        left join role r
        on ur.role_id = r.id
        where u.id = ?
        group by u.id;
    `;

    const accountResp = (await DataBase.instance.sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: [userId],
    })) as IDbUserAccount[];

    const accountDB = accountResp[0];
    if (!accountDB) throw new Error(`No se encontró la cuenta del usuario ${userId}`);

    const account: IUserAccount = {
      ...accountDB,
      roles: JSON.parse(accountDB.roles),
    };

    return account;
  } catch (error) {
    throw error;
  }
};

// companyId=null (solo para llamadas is_system) omite el filtro de tenant.
// Sin este join/filtro, cualquier usuario autenticado podía consultar los
// datos de un usuario de OTRA empresa con solo adivinar/conocer su id.
const findUserInformationById = async (userId: number, companyId: number | null) => {
  try {
    const query = `
        select  u.id, u.username, u.email, u.name, u.paternal_lastname, u.maternal_lastname,
                u.date_of_birth, u.status, u.document_type, u.document_number, u.gender,
                u.phone_number, u.address, u.login_status, u.failed_attempts,
                u.last_lock_date, u.last_unlock_date, u.lockout_minutes, u.device_id,
                u.recovery_code, u.business_unit_id, u.is_deleted, u.created_by, u.created_at,
                u.updated_at, u.updated_by,
                coalesce(json_arrayagg( json_object('id', ur.role_id, 'name', r.name)), '[]') roles,
                any_value(ur.role_id) as roleIds

        from user u
        left join user_role ur
        on u.id = ur.user_id
        left join role r
        on ur.role_id = r.id
        left join business_unit bu
        on u.business_unit_id = bu.id
        where u.id = :userId
        and (:companyId is null or coalesce(bu.company_id, u.company_id) = :companyId)
        group by u.id
    `;

    const resp = (await DataBase.instance.sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: { userId, companyId },
    })) as IDBUserInformation[];

    if (resp.length == 0) {
      return null;
    }

    const dbUser = resp[0];
    if (!dbUser) return null;

    const id_rol = JSON.parse(dbUser.roles);

    const fid_rol = id_rol[0].id;

    const userInformation: IUserInformation = {
      ...dbUser,
      status: !!dbUser.status,
      roles: fid_rol === null ? JSON.parse("[]") : JSON.parse(dbUser.roles),
    };

    return userInformation;
  } catch (error) {
    throw error;
  }
};

export { getUsersList, findOneUser, getAccountById, findUserInformationById, getUserTenantInfo };
