import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";

// Las cuentas de la empresa (banco, Yape, Plin) son filas de general_variable
// con esta categoría — las que se cargan en "Documentos de la empresa".
export const PAYMENT_ACCOUNT_CATEGORY = "payment_account";

// Yape y Plin se identifican por un celular peruano: 9 dígitos que empiezan
// con 9. Una cuenta bancaria no tiene un formato único, así que no se valida.
const MOBILE_WALLETS = new Map([
  ["yape", "Yape"],
  ["plin", "Plin"],
]);
const PERU_MOBILE_REGEX = /^9\d{8}$/;

export const assertPaymentAccountNumber = (type: string | null | undefined, number: string | null | undefined): void => {
  const wallet = MOBILE_WALLETS.get(type ?? "");
  if (!wallet || PERU_MOBILE_REGEX.test(number ?? "")) return;
  throw new AppError(
    400,
    `El número de ${wallet} debe tener 9 dígitos y empezar con 9`,
    undefined,
    "INVALID_PAYMENT_ACCOUNT_NUMBER"
  );
};

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
  transaction,
}: {
  accountId: unknown;
  companyId: number;
  required: boolean;
  // Si el caller está dentro de una transacción, se pasa: con el pool chico
  // (max 5) pedir otra conexión mientras se sostiene una con filas
  // bloqueadas puede agotar el pool bajo carga.
  transaction?: Transaction;
}): Promise<number | null> => {
  const isEmpty = accountId === null || accountId === undefined || accountId === "";

  if (isEmpty) {
    if (!required) return null;
    const configured = await DataBase.instance.variable_general.count({
      where: { category: PAYMENT_ACCOUNT_CATEGORY, company_id: companyId, is_deleted: false },
      transaction,
    });
    if (configured === 0) return null;
    throw new AppError(400, "Indica a qué cuenta (banco, Yape o Plin) fue el dinero", undefined, "PAYMENT_ACCOUNT_REQUIRED");
  }

  const parsedId = Number(accountId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) throw new AppError(400, "La cuenta seleccionada no es válida");

  const account = await DataBase.instance.variable_general.findOne({
    where: { id: parsedId, category: PAYMENT_ACCOUNT_CATEGORY },
    transaction,
  });
  if (!account) throw new AppError(404, "La cuenta seleccionada no existe");
  if (account.company_id !== companyId) throw new AppError(403, "La cuenta seleccionada no pertenece a esta empresa");
  // Una cuenta deshabilitada ya no se ofrece en el selector: tampoco se acepta por API.
  if (account.is_deleted) throw new AppError(400, "La cuenta seleccionada está deshabilitada");

  return parsedId;
};

// Tablas que guardan la cuenta por la que se movió un dinero. Una cuenta que
// aparece en cualquiera de ellas es parte de la historia de Caja.
// Las tres últimas son del cierre de caja (saldo inicial declarado, saldos de
// un mes cerrado y patas de ajuste): tienen FK RESTRICT a general_variable,
// así que sin revisarlas acá borrar o re-categorizar la cuenta fallaba con un
// error crudo de la base (500) en vez del 409 PAYMENT_ACCOUNT_IN_USE.
const PAYMENT_ACCOUNT_REFERENCES = [
  "quotation_payment",
  "quotation_expense",
  "cash_movement",
  "employee_debt_payment",
  "employee_debt",
  "cash_ledger_opening",
  "cash_period_balance",
  "cash_adjustment_entry",
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
