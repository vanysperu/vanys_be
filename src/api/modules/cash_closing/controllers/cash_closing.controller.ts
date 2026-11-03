import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter, resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { resolveWriteScope } from "../../../../core/rbac/writeScope";
import { getCashClosingStatus } from "../services/find/status.service";
import { listCashClosings } from "../services/find/list.service";
import { getCashPeriodDetail } from "../services/find/detail.service";
import { CashPeriodAdjustmentType, listPeriodAdjustments } from "../services/find/adjustments.service";
import { listPeriodEvents } from "../services/find/events.service";
import { getCashBalances } from "../services/find/balances.service";
import { getCashOpening } from "../services/find/opening.service";
import { closeCashPeriod } from "../services/update/close.service";
import { reopenCashPeriod } from "../services/update/reopen.service";
import { setCashOpening } from "../services/update/opening.service";
import { CASH_CLOSING_CODES } from "../services/find/period_rules.service";

// Empresa y alcance salen SIEMPRE de la sesión (CLAUDE.md 10 y 11.1):
//   - usuario de empresa → la suya (lo que mande el query/body se ignora o da 403);
//   - Super Administrador → la que elija (?companyId en GET, company_id en PUT),
//     obligatoria: el cierre es por empresa.
// Quién accede lo decide el ROL (verifyAccess + resources de cash_closing,
// otorgados solo a administradores): un Administrador ve y cierra la caja de
// TODA su empresa aunque su usuario tenga una tienda asignada (pedido
// explícito del usuario: "todo admin ve lo de su empresa"). El gestor solo
// tiene /status (candados en los formularios).

const ENTITY_LABEL = "cierres de caja";
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;

const pageOf = (req: Request) => ({
  page: Number(req.query.page) || 1,
  limit: Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT),
});

const readCompanyOf = (user: IToken, queryCompanyId: unknown): number => {
  const companyId = resolveListCompanyFilter(user, queryCompanyId);
  if (companyId === null) throw new AppError(400, "Selecciona la empresa", undefined, CASH_CLOSING_CODES.companyRequired);
  return companyId;
};

// Lectura de cierres/saldos: la empresa de la sesión (o la elegida por el
// Super Administrador).
const companyForRead = (req: Request): number => readCompanyOf(req.user as IToken, req.query.companyId);

// Escritura (cerrar, reabrir, saldo inicial): un usuario de empresa queda
// forzado a la suya; resolveWriteScope corta a un usuario sin empresa (403).
const companyForWrite = async (req: Request): Promise<number> => {
  const user = req.user as IToken;
  resolveWriteScope(user);
  return resolveTargetCompanyId(user, req.body.company_id, ENTITY_LABEL);
};

const periodOfReq = (req: Request): string => String(req.params.period);

export const cashClosingStatusController = asyncHandler(async (req: Request, res: Response) => {
  const companyId = readCompanyOf(req.user as IToken, req.query.companyId);
  ok(res, 200, await getCashClosingStatus(companyId), "Estado del cierre de caja obtenido correctamente");
});

export const listCashClosingsController = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyForRead(req);
  const result = await listCashClosings({ companyId, ...pageOf(req) });
  const message = result.data.length === 0 ? "Todavía no se configuró la caja" : "Meses de caja obtenidos correctamente";
  ok(res, 200, result, message);
});

export const findCashPeriodController = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyForRead(req);
  ok(res, 200, await getCashPeriodDetail(companyId, periodOfReq(req)), "Detalle del mes obtenido correctamente");
});

export const listPeriodAdjustmentsController = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyForRead(req);
  const type: CashPeriodAdjustmentType = req.query.type === "affecting" ? "affecting" : "posted";
  const result = await listPeriodAdjustments({ companyId, period: periodOfReq(req), type, ...pageOf(req) });
  const message = result.data.length === 0 ? "Este mes no tiene ajustes" : "Ajustes obtenidos correctamente";
  ok(res, 200, result, message);
});

export const listPeriodEventsController = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyForRead(req);
  const result = await listPeriodEvents({ companyId, period: periodOfReq(req), ...pageOf(req) });
  ok(res, 200, result, "Historial del mes obtenido correctamente");
});

export const cashBalancesController = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyForRead(req);
  ok(res, 200, await getCashBalances(companyId), "Saldos de caja obtenidos correctamente");
});

export const findCashOpeningController = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyForRead(req);
  const startPeriod = typeof req.query.startPeriod === "string" && req.query.startPeriod ? req.query.startPeriod : undefined;
  ok(res, 200, await getCashOpening(companyId, startPeriod), "Saldo inicial obtenido correctamente");
});

export const setCashOpeningController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await companyForWrite(req);
  const openings = (req.body.openings as { payment_account_id?: unknown; amount: unknown }[]).map((row) => ({
    payment_account_id:
      row.payment_account_id === null || row.payment_account_id === undefined ? null : Number(row.payment_account_id),
    amount: Number(row.amount),
  }));
  const result = await setCashOpening({
    companyId,
    startPeriod: String(req.body.start_period),
    openings,
    notes: req.body.notes ?? null,
    actorId: user.userId,
  });
  ok(res, 200, result, "Saldo inicial guardado correctamente");
});

export const closeCashPeriodController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await companyForWrite(req);
  const result = await closeCashPeriod({
    companyId,
    period: periodOfReq(req),
    notes: req.body.notes ?? null,
    actorId: user.userId,
  });
  ok(res, 200, result, "Mes cerrado correctamente");
});

export const reopenCashPeriodController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await companyForWrite(req);
  const result = await reopenCashPeriod({
    companyId,
    period: periodOfReq(req),
    reason: typeof req.body.reason === "string" ? req.body.reason : "",
    actorId: user.userId,
  });
  ok(res, 200, result, "Mes reabierto correctamente");
});
