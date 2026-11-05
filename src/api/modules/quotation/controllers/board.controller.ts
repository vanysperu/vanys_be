import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import {
  BOARD_DEFAULT_PER_STATUS,
  BOARD_MAX_PER_STATUS,
  getQuotationBoard,
} from "../services/find/quotation_board.service";

const positiveInt = (value: unknown): number | undefined => (Number(value) > 0 ? Math.floor(Number(value)) : undefined);

// GET /quotation/board?perStatus=&companyId=&businessUnitId=&clientId=&dateFrom=&dateTo=
// Mismo alcance que el listado: la empresa y la tienda del usuario las decide
// el backend (un usuario atado a una tienda ve solo esa, mande lo que mande).
export const quotationBoardController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { query } = req;

  const board = await getQuotationBoard({
    companyId: resolveListCompanyFilter(user, query.companyId),
    businessUnitId: resolveBusinessUnitFilter(user) ?? positiveInt(query.businessUnitId),
    clientId: positiveInt(query.clientId),
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    perStatus: Math.min(positiveInt(query.perStatus) ?? BOARD_DEFAULT_PER_STATUS, BOARD_MAX_PER_STATUS),
  });

  ok(res, 200, board, "Tablero de cotizaciones obtenido correctamente");
});
