import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createResource } from "../services/create/resource.service";
import { updateResourceById } from "../services/update/resource.service";
import { getResourceById, getResourcesList } from "../services/find/resource.service";
import { disableOrEnableResourceById } from "../services/delete/resource.service";
import { WhereOptions } from "sequelize";
import { ResourceAttributes } from "../models/resource.model";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";

export const createResourceController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const resource = await createResource({ resource: req.body, createdBy: user.userId });

  ok(res, 201, resource, "Recurso creado correctamente");
});

export const updateResourceController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  const result = await updateResourceById({ resource: req.body, resourceId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Recurso actualizado correctamente");
});

export const listResourcesController = asyncHandler(async (req: Request, res: Response) => {
  const queryParams = req.query;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(queryParams);
  const where: WhereOptions<ResourceAttributes> = {};

  if (queryParams.module_id) where.module_id = Number(queryParams.module_id);
  if (queryParams.type) where.type = queryParams.type as ResourceAttributes["type"];

  const resp = await getResourcesList({ page, limit, orderBy, orderDir, where });
  const message = resp.data.length === 0 ? "No se encontraron recursos" : "Lista de recursos obtenida correctamente";

  ok(res, 200, resp, message);
});

export const getResourceByIdController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const resource = await getResourceById(Number(id));

  ok(res, 200, resource, "Recurso obtenido correctamente");
});

export const disableResourceController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  const result = await disableOrEnableResourceById({ resourceId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Proceso exitoso");
});
