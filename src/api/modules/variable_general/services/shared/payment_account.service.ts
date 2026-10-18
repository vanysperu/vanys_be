import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";

// Las cuentas de la empresa (banco, Yape, Plin) son filas de general_variable
// con esta categoría — las que se cargan en "Documentos de la empresa".
export const PAYMENT_ACCOUNT_CATEGORY = "payment_account";

/**
 * Valida la cuenta por la que se mueve un dinero (pago recibido, ingreso o
 * egreso de caja, reposición a un trabajador) y devuelve su id, o null si es
 * efectivo.
 *
 * - La cuenta tiene que ser de la MISMA empresa del movimiento: sin esto,
 *   bastaba con adivinar un id para registrar plata contra la cuenta
 *   bancaria de otra empresa (mismo criterio que business_unit_id,
 *   CLAUDE.md sección 10).
 * - `required`: cuando el medio no es efectivo y la empresa SÍ tiene cuentas
 *   configuradas (activas), hay que decir a cuál fue (pedido explícito del usuario:
 *   "no especifica a qué banco fue realizado"). Si la empresa todavía no
 *   cargó ninguna, no se bloquea: no habría nada que elegir.
 */
export const resolvePaymentAccountId = async ({
  accountId,
  companyId,
  required,
}: {
  accountId: unknown;
  companyId: number;
  required: boolean;
}): Promise<number | null> => {
  const isEmpty = accountId === null || accountId === undefined || accountId === "";

  if (isEmpty) {
    if (!required) return null;
    const configured = await DataBase.instance.variable_general.count({
      where: { category: PAYMENT_ACCOUNT_CATEGORY, company_id: companyId, is_deleted: false },
    });
    if (configured === 0) return null;
    throw new AppError(400, "Indica a qué cuenta (banco, Yape o Plin) fue el dinero", undefined, "PAYMENT_ACCOUNT_REQUIRED");
  }

  const parsedId = Number(accountId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) throw new AppError(400, "La cuenta seleccionada no es válida");

  const account = await DataBase.instance.variable_general.findOne({
    where: { id: parsedId, category: PAYMENT_ACCOUNT_CATEGORY },
  });
  if (!account) throw new AppError(404, "La cuenta seleccionada no existe");
  if (account.company_id !== companyId) throw new AppError(403, "La cuenta seleccionada no pertenece a esta empresa");
  // Una cuenta deshabilitada ya no se ofrece en el selector: tampoco se acepta por API.
  if (account.is_deleted) throw new AppError(400, "La cuenta seleccionada está deshabilitada");

  return parsedId;
};
