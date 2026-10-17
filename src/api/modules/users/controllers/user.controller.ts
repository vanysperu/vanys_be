import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import {
  findOneUser,
  findUserInformationById,
  getAccountById,
  getUsersList,
} from "../services/find/user.service";
import { updateUserById, updateUserPassword } from "../services/update/user.service";
import sequelize from "sequelize";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { CreateUserDto } from "../dtos";
import { DEFAULT_TEMPORARY_PASSWORD } from "../constants/defaultValues";
import {
  assertNotLastCompanyAdmin,
  assertRoleIsAssignable,
  batchDisableUserById,
  createUserAndSendMailServiceSimple,
  disableOrEnableUserById,
  LastCompanyAdminError,
} from "../services";
import { verify } from "../../../../security/criptoService";
import { UpdateUserDto } from "../dtos/update-user.dto";
import { DataBase } from "../../../../database";
import { UserAttributes } from "../models/user.model";
import { IListQueryParams } from "../../../interfaces/IListQuery.interface";
import { IUserQueryParams } from "../interfaces/IUserQueryParams";
import { createLogController } from "../../logs/controllers/log.controller";
import { LogAction } from "../../logs/model/log.model";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";

export const getUserAccountController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  const userAccount = await getAccountById(user.userId);

  ok(res, 200, userAccount, "Cuenta del usuario obtenida correctamente");
});

export const createUserController = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user as IToken;
  const { userId, companyId, isSystem } = authUser;
  const {
    roles,
    name,
    paternal_lastname,
    email,
    document_number,
    maternal_lastname,
    date_of_birth,
    phone_number,
    address,
    gender,
    document_type,
    roleIds,
  } = req.body as CreateUserDto;

  // Regla pedida por el usuario: TODO usuario debajo de Super Administrador
  // necesita una empresa. Quién la elige y si la tienda es obligatoria
  // depende de quién crea:
  // - Super Administrador (is_system): elige la EMPRESA (obligatoria);
  //   la tienda es opcional (puede crear un "admin de empresa" sin tienda
  //   propia).
  // - Administrador de empresa (no is_system): nunca elige empresa (siempre
  //   la suya, forzada); la tienda es OBLIGATORIA (y si además está
  //   limitado a su propia tienda — regla de oro de negocios/sección 11.1 —
  //   se fuerza esa, sin importar lo que mande el body).
  const scopedBusinessUnitId = resolveBusinessUnitFilter(authUser);
  const requestedBusinessUnitId = (req.body as CreateUserDto).business_unit_id;
  const business_unit_id = scopedBusinessUnitId ?? requestedBusinessUnitId ?? null;

  let resolvedCompanyId: number;

  if (isSystem) {
    const requestedCompanyId = Number((req.body as CreateUserDto & { company_id?: number }).company_id);
    if (!requestedCompanyId) {
      throw new AppError(400, "La empresa es obligatoria");
    }
    const company = await DataBase.instance.company.findByPk(requestedCompanyId);
    if (!company) throw new AppError(404, "La empresa seleccionada no existe");
    resolvedCompanyId = requestedCompanyId;
  } else {
    if (!business_unit_id) {
      throw new AppError(400, "La tienda (business_unit_id) es obligatoria");
    }
    resolvedCompanyId = companyId!;
  }

  if (business_unit_id) {
    const businessUnit = await DataBase.instance.business_unit.findByPk(business_unit_id);
    if (!businessUnit || businessUnit.company_id !== resolvedCompanyId) {
      throw new AppError(403, "La tienda seleccionada no pertenece a esta empresa");
    }
  }

  await assertRoleIsAssignable({ roleId: roleIds, callerIsSystem: isSystem, targetCompanyId: resolvedCompanyId });
  // Contraseña temporal fija (no se envía correo real todavía — ver
  // README del módulo). El usuario la cambia obligatoriamente en su
  // primer login (must_change_password, ver services/create).
  const temporaryPassword = DEFAULT_TEMPORARY_PASSWORD;

  let result;
  try {
    result = await createUserAndSendMailServiceSimple({
      createUserDto: {
        roles,
        name,
        paternal_lastname,
        email,
        username: email,
        password: temporaryPassword,
        document_number,
        document_type,
        company_id: resolvedCompanyId,
        business_unit_id,
        maternal_lastname,
        date_of_birth,
        phone_number,
        address,
        gender,
        roleIds,
      },
      createdBy: userId,
    });
  } catch (err: unknown) {
    // Antes esta rama tenía un bug: llamaba `next()` dos veces sin
    // `return` (una vez si era ValidationError, y siempre otra con 404).
    // Ahora un solo error, con el status correcto según el caso.
    if (err instanceof sequelize.ValidationError) {
      throw new AppError(400, "Los datos ingresados no son válidos.", err.message);
    }
    const message = err instanceof Error ? err.message : "No se pudo crear el usuario";
    throw new AppError(404, message);
  }

  const payloadLog = {
    user_id: userId,
    action: LogAction.CREATE,
    module: "user",
    description: `Usuario '${name} ${paternal_lastname}' creado con ID ${result.id}`,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: companyId,
  };
  createLogController(payloadLog);

  ok(
    res,
    200,
    { id: result.id, temporaryPassword: temporaryPassword },
    `Usuario creado correctamente. Contraseña temporal: "${temporaryPassword}" (se le pedirá cambiarla al iniciar sesión)`
  );
});

// Bug de seguridad pre-existente corregido acá: antes ningún endpoint de
// update/disable de usuario verificaba que el usuario objetivo perteneciera
// a la empresa (y, ahora, a la tienda) del caller — cualquier admin
// autenticado podía editar/deshabilitar un usuario de OTRA empresa con solo
// conocer su id numérico. Mismo patrón `assertXBelongsToCaller` que ya usan
// client.controller.ts/quotation.controller.ts.
const assertUserBelongsToCaller = async (targetUserId: number, user: IToken): Promise<boolean> => {
  if (user.isSystem) return true;

  const target = await DataBase.instance.user.findOne({
    where: { id: targetUserId },
    include: [{ association: "business_unit", attributes: ["id", "company_id"] }],
  });
  if (!target) return false;

  // Igual que getUserTenantInfo: si el objetivo tiene tienda, la empresa
  // de esa tienda manda; si no (admin de empresa sin tienda propia), cae
  // al company_id directo del usuario.
  const targetCompanyId =
    (target as unknown as { business_unit?: { company_id: number } | null }).business_unit?.company_id ??
    target.company_id ??
    null;
  if (targetCompanyId !== user.companyId) return false;

  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  if (scopedBusinessUnitId === undefined) return true;

  return target.business_unit_id === scopedBusinessUnitId;
};

// Empresa efectiva del usuario objetivo — misma regla que getUserTenantInfo
// y assertUserBelongsToCaller: si tiene tienda, manda la empresa de la
// tienda; si no, su company_id directo. Se necesita aparte para validar
// contra qué empresa se compara el rol que se le quiere asignar (un
// is_system edita usuarios de cualquier empresa, así que no alcanza con
// usar el companyId del caller).
const resolveTargetUserCompanyId = async (targetUserId: number): Promise<number | null> => {
  const target = await DataBase.instance.user.findOne({
    where: { id: targetUserId },
    include: [{ association: "business_unit", attributes: ["id", "company_id"] }],
  });
  if (!target) return null;

  return (
    (target as unknown as { business_unit?: { company_id: number } | null }).business_unit?.company_id ??
    target.company_id ??
    null
  );
};

export const updateUserController = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user as IToken;
  const { userId, companyId } = authUser;
  const { id } = req.params;

  if (!(await assertUserBelongsToCaller(Number(id), authUser))) {
    throw new AppError(403, "No tienes acceso a este usuario");
  }

  const {
    date_of_birth,
    address,
    document_number,
    document_type,
    email,
    gender,
    maternal_lastname,
    name,
    paternal_lastname,
    phone_number,
    roleIds,
    status,
  } = req.body as UpdateUserDto;

  await assertRoleIsAssignable({
    roleId: roleIds,
    callerIsSystem: authUser.isSystem,
    targetCompanyId: await resolveTargetUserCompanyId(Number(id)),
  });

  const transaction = await DataBase.instance.sequelize.transaction();

  // Try/catch se mantiene únicamente para el rollback de la transacción;
  // el error siempre se vuelve a lanzar al final (CLAUDE.md sección 5).
  try {
    await updateUserById({
      userId: Number(id),
      updateUserDto: {
        date_of_birth,
        address,
        document_number,
        document_type,
        email,
        gender,
        maternal_lastname,
        name,
        paternal_lastname,
        phone_number,
        roleIds,
        status,
      },
      transaction,
      updatedBy: userId,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw new AppError(500, "Sucedió un error inesperado al actualizar los datos del usuario. Consulte con su administrador");
  }

  const payloadLog = {
    user_id: userId,
    action: LogAction.UPDATE,
    module: "user",
    description: `Usuario '${name} ${paternal_lastname}' con ID ${id} fue editado`,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: companyId,
  };
  createLogController(payloadLog);

  ok(res, 200, { id: Number(id) }, "Datos del usuario actualizados correctamente");
});

export const disableEnabledUserForAdminController = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user as IToken;
  const { userId, companyId } = authUser;
  const { id } = req.params;

  if (!(await assertUserBelongsToCaller(Number(id), authUser))) {
    throw new AppError(403, "No tienes acceso a este usuario");
  }

  try {
    await assertNotLastCompanyAdmin(Number(id));
  } catch (err: unknown) {
    if (err instanceof LastCompanyAdminError) throw new AppError(409, err.message);
    throw err;
  }

  const result = await disableOrEnableUserById({
    userId: Number(id),
    updatedBy: userId,
  });
  const payloadLog = {
    user_id: userId,
    action: result?.status ? LogAction.ACTIVE : LogAction.DISABLE,
    module: "user",
    description: `Usuario con ID ${id} fue ${result?.status ? "Habilitado" : "Deshabilitado"}`,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: companyId,
  };
  createLogController(payloadLog);

  ok(res, 200, result, result?.status ? "Usuario Habilitado" : "Usuario Deshabilitado");
});

export const batchDisableUserController = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user as IToken;
  const { userId } = authUser;
  const { ids } = req.body as { ids: number[] };

  const ownershipChecks = await Promise.all(ids.map((targetId) => assertUserBelongsToCaller(targetId, authUser)));
  if (ownershipChecks.some((belongs) => !belongs)) {
    throw new AppError(403, "No tienes acceso a uno o más de los usuarios seleccionados");
  }

  try {
    for (const targetId of ids) {
      await assertNotLastCompanyAdmin(
        targetId,
        ids.filter((otherId) => otherId !== targetId)
      );
    }
  } catch (err: unknown) {
    if (err instanceof LastCompanyAdminError) throw new AppError(409, err.message);
    throw err;
  }

  const result = await batchDisableUserById({
    ids,
    updatedBy: userId,
  });

  ok(res, 200, result, "Usuarios deshabilitados correctamente");
});

// El validador de paginación solo exige que `orderBy` sea un string (no
// conoce las columnas reales de cada módulo), y `getUsersList` interpola ese
// valor directamente en un `ORDER BY` de SQL crudo -- sin esta lista blanca,
// cualquiera podía inyectar SQL vía `?orderBy=...` en este endpoint.
const USER_LIST_SORTABLE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "name",
  "paternal_lastname",
  "maternal_lastname",
  "email",
  "username",
  "status",
  "fullName",
]);

export const listUsersController = asyncHandler(async (req: Request<any, any, any, IUserQueryParams>, res: Response) => {
  const queryParams = req.query;
  const { page, limit, orderBy: requestedOrderBy, orderDir } = parsePaginationParams(req.query as Record<string, unknown>);
  const endDate = queryParams.endDate || undefined;
  const startDate = queryParams.startDate || undefined;
  const isActive = queryParams.isActive || undefined;
  const roleId = Number(queryParams.roleId) || undefined;
  const searchTerm = queryParams.searchTerm || undefined;
  // Filtros por columna de la tabla (nombre/email/rol) — se agregan al
  // buscador global existente, no lo reemplazan.
  const name = (queryParams as unknown as Record<string, string | undefined>).name || undefined;
  const email = (queryParams as unknown as Record<string, string | undefined>).email || undefined;
  const roleName = (queryParams as unknown as Record<string, string | undefined>).roleName || undefined;
  // Misma lista blanca de antes: si el valor pedido no está permitido, se
  // conserva el mismo fallback silencioso a "created_at" (nunca se lanza 400).
  const orderBy = USER_LIST_SORTABLE_COLUMNS.has(requestedOrderBy) ? requestedOrderBy : "created_at";

  // TODO: Optimizar
  let where: { office_id?: string; area_id?: string; fullName?: string } | undefined = undefined;
  if (queryParams.useFilters) {
    where = {};
    const { office_id, area_id, fullName } = queryParams;
    if (office_id) where.office_id = String(office_id);
    if (area_id) where.area_id = String(area_id);
    if (fullName) where.fullName = String(fullName);
  }

  // TODO: Es experimental, borrar si no funciona
  //const columns = queryParams?.columns ? queryParams?.columns?.split(',').map( (e) => e.trim()) : undefined

  const authUser = req.user as IToken;
  const { companyId, isSystem } = authUser;

  const resp = await getUsersList({
    page,
    limit,
    companyId: isSystem ? null : companyId,
    businessUnitId: resolveBusinessUnitFilter(authUser),
    filters: {
      fullName: where?.fullName,
      endDate: endDate as string | undefined,
      startDate: startDate as string | undefined,
      isActive: isActive as string | undefined,
      roleId,
      searchTerm,
      orderDir,
      orderBy,
      name,
      email,
      roleName,
    },
  });
  let message = "Lista de usuarios obtenidos correctamente";

  if (resp.data.length === 0) {
    message = "No se encontraron usuarios";
  }

  ok(res, 200, resp, message);
});

export const updateMyUserPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const { userId, companyId } = req.user as IToken;

  const user = await findOneUser({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new AppError(400, "Usuario no encontrado o no disponible");
  }

  const { oldPassword, newPassword } = req.body;
  const isOldPassword = await verify(oldPassword, user.salt, user.password);

  if (!isOldPassword) {
    throw new AppError(400, "Contraseña inicial incorrecta");
  }

  const updated = await updateUserPassword({
    userId,
    updatedBy: userId,
    password: newPassword,
  });
  const payloadLog = {
    user_id: userId,
    action: LogAction.UPDATE,
    module: "user",
    description: `Usuario con ID ${userId} realizó un cambio de contraseña`,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: companyId,
  };
  createLogController(payloadLog);

  ok(res, 200, updated, "Contraseña actualizada correctamente");
});

export const findUserInformationByIdController = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const { companyId, isSystem } = req.user as IToken;
  const user = await findUserInformationById(Number(userId), isSystem ? null : companyId);

  if (!user) {
    throw new AppError(404, `No se encontró usuario con el id ${userId}`);
  }

  ok(res, 200, user, "Usuario obtenido correctamente");
});
