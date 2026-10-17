import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { getRolesList } from "../services/find/role.service";
import { createRole } from "../services/create/role.services";
import { updateRoleById } from "../services/update/role.service";
import { disableOrEnabledRolById } from "../services/delete/role.service";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { nowUtc } from "../../../../utils/dateUtils";

export const listRolesController = asyncHandler(async (req: Request, res: Response) => {
  const { isSystem, companyId } = req.user as IToken;
  const queryParams = req.query;
  const page = Number(queryParams.page) || undefined;
  const limit = Number(queryParams.limit) || undefined;
  // orderBy/orderDir/filtros por columna (nombre, descripción, tipo): mismo
  // criterio que client/product, se agregan sin tocar el shape de respuesta
  // (CountedListResult) que ya consume el frontend.
  const orderBy = typeof queryParams.orderBy === "string" ? queryParams.orderBy : undefined;
  const orderDirRaw = typeof queryParams.orderDir === "string" ? queryParams.orderDir.toLowerCase() : undefined;
  const orderDir: "asc" | "desc" = orderDirRaw === "asc" ? "asc" : "desc";
  const name = typeof queryParams.name === "string" ? queryParams.name : undefined;
  const description = typeof queryParams.description === "string" ? queryParams.description : undefined;
  const isSystemFilter = typeof queryParams.isSystem === "string" ? queryParams.isSystem : undefined;

  const resp = await getRolesList({
    page,
    limit,
    companyId: isSystem ? null : companyId,
    orderBy,
    orderDir,
    name,
    description,
    isSystemFilter,
  });
  let message = "Lista de roles obtenidas correctamente";

  if (resp.rows.length === 0) {
    message = "No se encontraron roles";
  }

  ok(res, 200, resp, message);
});

export const createRoleController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { name, description, company_id } = req.body;
  const createdBy = user.userId;

  // Un usuario is_system puede armar el rol para una empresa específica
  // (ej. al dar de alta un tenant nuevo) pasando company_id; si no lo
  // manda, el rol queda global (company_id null). Un usuario normal NUNCA
  // puede elegir la empresa: siempre se estampa la suya, sin importar lo
  // que mande el body.
  const targetCompanyId = user.isSystem ? company_id ?? null : user.companyId;

  const role = await createRole({
    role: {
      id: 0,
      status: true,
      created_at: nowUtc(),
      name: name,
      description: description,
    },
    createdBy,
    companyId: targetCompanyId,
  });

  ok(res, 200, role, "Rol creado correctamente");
});

export const updateRoleController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  const { id } = req.params;
  const { name, description } = req.body;

  const result = await updateRoleById({
    role: {
      name,
      description,
      updated_by: user.userId,
    },
    rolId: Number(id),
    updatedBy: user.userId,
    companyId: user.isSystem ? null : user.companyId,
  });

  // Corregido: antes esta rama respondía dos veces (bug de "double
  // response") cuando result[0] == 0 — ahora corta con `return`.
  if (result[0] == 0) {
    return ok(res, 200, result, "No se puede actualizar variables del sistema");
  }

  ok(res, 200, result, "Se actualizó correctamente");
});

export const disableEnabledRoleController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  const { id } = req.params;

  const result = await disableOrEnabledRolById({
    rolId: Number(id),
    updatedBy: user.userId,
    companyId: user.isSystem ? null : user.companyId,
  });

  ok(res, 200, result, "Proceso exitoso");
});
