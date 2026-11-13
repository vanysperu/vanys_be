import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getWorkflowBoardService } from "../services/get_board.service";
import { resolveWorkflowCompanyId } from "../services/shared/workflow_company";

// GET /api/production-workflow/board — columnas activas y reglas para el
// kanban de productos de una cotización.
export const getWorkflowBoardController = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await resolveWorkflowCompanyId(req.user as IToken, req.query.companyId);
  const board = await getWorkflowBoardService(companyId);
  ok(res, 200, board);
});
