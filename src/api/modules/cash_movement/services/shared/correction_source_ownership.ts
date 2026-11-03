import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { MoneyCorrectionSource } from "../../../money_correction/types/money_correction.types";
import { REIMBURSEMENT_ALLOCATIONS_FROM_SQL } from "./cash_flow.sql";

// A quién pertenece la fila de una fuente de dinero (para el alcance del
// historial de correcciones). Una reposición puede cubrir deudas de varias
// tiendas, por eso son varias tiendas posibles.
export interface SourceOwnership {
  company_id: number;
  business_unit_ids: Array<number | null>;
}

interface OwnerRow {
  company_id: number | string;
  business_unit_id: number | string | null;
}

const toNullableNumber = (value: number | string | null): number | null => (value === null ? null : Number(value));

const selectOwners = async (sql: string, id: number): Promise<OwnerRow[]> =>
  DataBase.instance.sequelize.query<OwnerRow>(sql, { type: QueryTypes.SELECT, replacements: { id } });

// SQL fijo por fuente (texto del código, el id va bindeado). Pago y gasto
// heredan empresa y tienda de su cotización; deuda y movimiento manual las
// tienen propias.
const SINGLE_OWNER_SQL: Record<Exclude<MoneyCorrectionSource, "employee_debt_payment">, string> = {
  manual: "SELECT company_id, business_unit_id FROM cash_movement WHERE id = :id",
  quotation_payment: `SELECT q.company_id, q.business_unit_id FROM quotation_payment qp
    INNER JOIN quotation q ON q.id = qp.quotation_id WHERE qp.id = :id`,
  quotation_expense: `SELECT q.company_id, q.business_unit_id FROM quotation_expense qe
    INNER JOIN quotation q ON q.id = qe.quotation_id WHERE qe.id = :id`,
  employee_debt: "SELECT company_id, business_unit_id FROM employee_debt WHERE id = :id",
};

// Reposición: la empresa es la de la reposición; las tiendas son las de las
// deudas que cubrió (la de la cotización de la compra o, en una deuda manual,
// la de la propia deuda — mismo criterio que Caja).
const loadReimbursementOwnership = async (id: number): Promise<SourceOwnership | null> => {
  const [payment] = await selectOwners("SELECT company_id, NULL AS business_unit_id FROM employee_debt_payment WHERE id = :id", id);
  if (!payment) return null;

  const stores = await selectOwners(
    `SELECT DISTINCT p.company_id, COALESCE(rq.business_unit_id, ed.business_unit_id) AS business_unit_id
     FROM ${REIMBURSEMENT_ALLOCATIONS_FROM_SQL}
     WHERE p.id = :id`,
    id
  );
  return { company_id: Number(payment.company_id), business_unit_ids: stores.map((row) => toNullableNumber(row.business_unit_id)) };
};

/**
 * Empresa y tienda(s) de la fila `sourceId` de `source`, o null si no existe.
 * No aplica ningún permiso: el caller decide con su alcance.
 */
export const loadSourceOwnership = async (
  source: MoneyCorrectionSource,
  sourceId: number
): Promise<SourceOwnership | null> => {
  if (source === "employee_debt_payment") return loadReimbursementOwnership(sourceId);

  const [row] = await selectOwners(SINGLE_OWNER_SQL[source], sourceId);
  if (!row) return null;
  return { company_id: Number(row.company_id), business_unit_ids: [toNullableNumber(row.business_unit_id)] };
};
