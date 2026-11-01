import { QueryTypes } from "sequelize";
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

// Tablas que guardan la cuenta por la que se movió un dinero. Una cuenta que
// aparece en cualquiera de ellas es parte de la historia de Caja.
const PAYMENT_ACCOUNT_REFERENCES = [
  "quotation_payment",
  "quotation_expense",
  "cash_movement",
  "employee_debt_payment",
  "employee_debt",
] as const;

export const isPaymentAccountInUse = async (accountId: number): Promise<boolean> => {
  // Nombres de tabla fijos del código, nunca un valor externo.
  const checks = PAYMENT_ACCOUNT_REFERENCES.map(
    (table) => `EXISTS (SELECT 1 FROM ${table} WHERE payment_account_id = :accountId)`
  );
  const [row] = await DataBase.instance.sequelize.query<{ in_use: number | string }>(
    `SELECT (${checks.join(" OR ")}) AS in_use`,
    { type: QueryTypes.SELECT, replacements: { accountId } }
  );
  return Number(row?.in_use) === 1;
};

/**
 * Antes, eliminar una cuenta en "Documentos de la empresa" la borraba
 * físicamente y la base pasaba a NULL la cuenta de todos sus pagos y
 * movimientos: el historial aparecía de golpe como "Efectivo" y Caja dejaba
 * de cuadrar. Una cuenta con movimientos ya no se elimina (tampoco cambia de
 * categoría): se deshabilita, que la saca de los selectores y conserva su
 * historia. La base también lo impide (llaves RESTRICT).
 */
export const assertPaymentAccountCanBeRemoved = async (accountId: number): Promise<void> => {
  if (!(await isPaymentAccountInUse(accountId))) return;
  throw new AppError(
    409,
    "Esta cuenta ya tiene movimientos registrados: no se puede eliminar. Deshabilítala para que no se use más; su historial se conserva.",
    undefined,
    "PAYMENT_ACCOUNT_IN_USE"
  );
};
