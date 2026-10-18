import { buildBusinessDateRange, resolveIsDeletedFilter } from "../../../../core/utils/listFilters";
import { Op, WhereOptions } from "sequelize";
import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createClient } from "../services/create/client.service";
import { updateClientById } from "../services/update/client.service";
import { getClientById, getClientsList } from "../services/find/client.service";
import { disableOrEnableClientById } from "../services/delete/client.service";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { ClientAttributes } from "../model/client.model";
import { resolveBusinessUnitFilter, resolveTargetBusinessUnitId } from "../../../../core/rbac/businessUnitScope";

// Filtros por columna de "Clientes": texto -> LIKE, estado -> match exacto.
const buildClientListWhere = (query: Record<string, unknown>): WhereOptions<ClientAttributes> => {
  const where: WhereOptions<ClientAttributes> = {};
  if (typeof query.phone === "string" && query.phone.trim()) {
    where.phone = { [Op.like]: `%${query.phone.trim()}%` };
  }
  if (typeof query.documentNumber === "string" && query.documentNumber.trim()) {
    where.document_number = { [Op.like]: `%${query.documentNumber.trim()}%` };
  }
  if (typeof query.name === "string" && query.name.trim()) {
    where.name = { [Op.like]: `%${query.name.trim()}%` };
  }
  if (typeof query.email === "string" && query.email.trim()) {
    where.email = { [Op.like]: `%${query.email.trim()}%` };
  }
  const isDeleted = resolveIsDeletedFilter(query.status);
  if (isDeleted !== undefined) where.is_deleted = isDeleted;
  const createdAt = buildBusinessDateRange(query.dateFrom, query.dateTo);
  if (createdAt) where.created_at = createdAt;
  return where;
};

export const createClientController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  // Un admin de empresa solo crea clientes de SU empresa — nunca confía
  // en el company_id que manda el body (CLAUDE.md sección 10).
  if (!user.isSystem && Number(req.body.company_id) !== user.companyId) {
    throw new AppError(403, "No puedes crear clientes para otra empresa");
  }

  // Regla de oro de tiendas: si el usuario está limitado a una tienda propia,
  // el cliente se crea SIEMPRE en esa tienda, sin importar lo que mande el
  // body (mismo criterio que company_id arriba, nunca se confía en el front).
  const business_unit_id = await resolveTargetBusinessUnitId(user, req.body.business_unit_id);

  const client = await createClient({
    client: { ...req.body, business_unit_id },
    createdBy: user.userId,
  });

  ok(res, 201, client, "Cliente creado correctamente");
});

export const updateClientController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertClientBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a este cliente");
  }

  const result = await updateClientById({ client: req.body, clientId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Cliente actualizado correctamente");
});

export const listClientsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { isSystem, companyId } = user;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  const searchTerm = (req.query.searchTerm as string) || undefined;
  const where = buildClientListWhere(req.query as Record<string, unknown>);

  const resp = await getClientsList({
    page,
    limit,
    orderBy,
    orderDir,
    companyId: isSystem ? null : companyId,
    businessUnitId: resolveBusinessUnitFilter(user),
    searchTerm,
    where,
  });
  const message = resp.data.length === 0 ? "No se encontraron clientes" : "Lista de clientes obtenida correctamente";

  ok(res, 200, resp, message);
});

export const disableClientController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertClientBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a este cliente");
  }

  const result = await disableOrEnableClientById({ clientId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Proceso exitoso");
});

const assertClientBelongsToCaller = async (clientId: number, user: IToken): Promise<boolean> => {
  if (user.isSystem) return true;

  const client = await getClientById(clientId);
  if (!client) return false;
  if (client.company_id !== user.companyId) return false;

  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  if (scopedBusinessUnitId === undefined) return true;

  return client.business_unit_id === scopedBusinessUnitId;
};
