import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createModule } from "../services/create/module.service";
import { updateModuleById } from "../services/update/module.service";
import { getModulesList } from "../services/find/module.service";
import { disableOrEnableModuleById } from "../services/delete/module.service";

export const createModuleController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const module = await createModule({ module: req.body, createdBy: user.userId });

  ok(res, 201, module, "Módulo creado correctamente");
});

export const updateModuleController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  const result = await updateModuleById({ module: req.body, moduleId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Módulo actualizado correctamente");
});

export const listModulesController = asyncHandler(async (req: Request, res: Response) => {
  const queryParams = req.query;
  const page = Number(queryParams.page) || undefined;
  const limit = Number(queryParams.limit) || undefined;

  const resp = await getModulesList({ page, limit });
  const message = resp.rows.length === 0 ? "No se encontraron módulos" : "Lista de módulos obtenida correctamente";

  ok(res, 200, resp, message);
});

export const disableModuleController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  const result = await disableOrEnableModuleById({ moduleId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Proceso exitoso");
});
