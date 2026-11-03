import { Request, Response } from "express";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createVariableGeneral } from "../services/create/variable_general.service";
import { deleteVariableGeneralById } from "../services/delete/variable_general.service";
import { disableOrEnableVariableGeneralById } from "../services/disable/variable_general.service";
import {
  findVariableGeneralById,
  getVariableGeneralList,
} from "../services/find/variable_general.service";
import { updateVariableGeneralById } from "../services/update/variable_general.service";
import { IToken } from "../../../interfaces/IToken.interface";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolveWriteScope } from "../../../../core/rbac/writeScope";

// Empresa sobre la que un usuario gestiona variables (detalle, crear, editar,
// deshabilitar, eliminar): null solo para el Super Administrador. Antes se
// usaba `isSystem ? null : companyId`, y un usuario de empresa SIN empresa
// (companyId null) quedaba con alcance de Super Administrador — veía y
// editaba variables de todas las empresas. resolveWriteScope lo corta con
// 403 NO_COMPANY_SCOPE.
const manageCompanyIdOf = (user: IToken): number | null => resolveWriteScope(user).companyId;

export const listVariableGeneralController = asyncHandler(async (req: Request, res: Response) => {
  const { companyId, isSystem } = req.user as IToken;
  const { search, category, ignorePagination, admin, title, name, status, scope } = req.query;
  const adminView = !!admin;
  // scope=manage lo manda SOLO la pantalla de gestión de Variables Generales:
  // un usuario de empresa ahí ve únicamente las filas de su empresa (sin las
  // globales). Los selectores de otras pantallas no lo envían y siguen
  // recibiendo las globales (métodos de pago, etapas por defecto, etc.).
  const manageScope = scope === "manage";
  // Un usuario no-system sin empresa no debe llegar acá; si pasara, el filtro
  // quedaría abierto, así que se corta.
  if (manageScope && !isSystem && companyId === null) {
    throw new AppError(403, "Tu usuario no tiene una empresa asignada");
  }
  // El modo "select" (adminView=false) alimenta <select> de otros formularios
  // y sigue usando su propio page/limit sin el validador estándar -- no es
  // una pantalla de listado (ver comentario en el service). El modo admin
  // (pantalla de gestión) sí usa el validador reusable de paginación.
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  const resp = await getVariableGeneralList({
    pagination: { page, limit },
    filter: {
      search: (search as string) || undefined,
      category: (category as string) || undefined,
      // El Super Administrador puede pedir ?companyId= (ej. las cuentas de
      // pago de la empresa elegida en "Nuevo movimiento de caja").
      companyId: resolveListCompanyFilter({ companyId, isSystem } as IToken, req.query.companyId),
      // Filtros por columna de la pantalla de administración.
      title: (title as string) || undefined,
      name: (name as string) || undefined,
      status: (status as string) || undefined,
      ownCompanyOnly: manageScope && !isSystem,
    },
    ignorePagination: !!ignorePagination,
    adminView,
    orderBy,
    orderDir,
  });
  const isEmpty = "data" in resp ? resp.data.length === 0 : resp.length === 0;
  const message = isEmpty ? "No se encontraron registros" : "Lista obtenida correctamente";
  ok(res, 200, resp, message);
});

export const getVariableGeneralByIdController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  // Lanza 403 (GLOBAL_VARIABLE_FORBIDDEN) si no es is_system y la fila es global.
  const item = await findVariableGeneralById(Number(id), manageCompanyIdOf(req.user as IToken));
  ok(res, 200, item, item ? "Encontrado" : "No encontrado");
});

export const createVariableGeneralController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const payload = req.body;
  // Un is_system puede elegir a qué empresa se asigna la variable (o
  // dejarla global con company_id null); un usuario de empresa SIEMPRE
  // queda forzado a la suya, nunca confía en lo que mande el body.
  const resolvedCompanyId = user.isSystem ? (payload.company_id ?? null) : manageCompanyIdOf(user);
  const created = await createVariableGeneral({ ...payload, company_id: resolvedCompanyId });
  ok(res, 200, created, "Creado correctamente");
});

export const updateVariableGeneralController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;
  const [affectedCount] = await updateVariableGeneralById(Number(id), payload, manageCompanyIdOf(req.user as IToken));

  if (affectedCount === 0) {
    throw new AppError(404, "No se encontró la variable general");
  }

  ok(res, 200, affectedCount, "Actualizado correctamente");
});

export const deleteVariableGeneralController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const deletedCount = await deleteVariableGeneralById(Number(id), manageCompanyIdOf(req.user as IToken));

  if (deletedCount === 0) {
    throw new AppError(404, "No se encontró la variable general");
  }

  ok(res, 200, deletedCount, "Eliminado correctamente");
});

// Deshabilita/habilita (toggle) en vez de eliminar físicamente, siguiendo el
// mismo patrón de "client"/"product" (CLAUDE.md sección 1: disable siempre
// es soft-delete, nunca DELETE físico).
export const disableVariableGeneralController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user as IToken;
  const [affectedCount] = await disableOrEnableVariableGeneralById({
    id: Number(id),
    companyId: manageCompanyIdOf(user),
    updatedBy: user.userId,
  });

  if (affectedCount === 0) {
    throw new AppError(404, "No se encontró la variable general");
  }

  ok(res, 200, affectedCount, "Proceso exitoso");
});
