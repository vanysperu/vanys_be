import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { correctionsCountSql } from "../../../money_correction/services/shared/corrections_count";
import { assertPaymentInWriteScope } from "../shared/payment_scope";

// Un pago con lo que necesita el diálogo de corrección (valores actuales,
// cotización, cliente, saldo).
export interface PaymentDetail {
  id: number;
  quotation_id: number;
  company_id: number;
  business_unit_id: number | null;
  client_name: string;
  amount: number;
  method: string | null;
  paid_at: string;
  notes: string | null;
  operation_number: string | null;
  payment_account_id: number | null;
  payment_account_name: string | null;
  is_deleted: boolean;
  // Total de la cotización y lo cobrado SIN contar este pago: el diálogo
  // calcula con ellos el tope del nuevo monto.
  quotation_total: number;
  paid_by_others: number;
  corrections_count: number;
}

interface RawPaymentDetail {
  id: number;
  quotation_id: number;
  company_id: number;
  business_unit_id: number | null;
  client_name: string;
  amount: string;
  method: string | null;
  paid_at: string;
  notes: string | null;
  operation_number: string | null;
  payment_account_id: number | null;
  payment_account_name: string | null;
  is_deleted: number | boolean;
  quotation_total: string;
  paid_by_others: string;
  corrections_count: number | string;
}

/**
 * Un pago por id (GET /payment/find/:id). Alcance como el de editar: otra
 * empresa 403, otra tienda 404. `scope` lo arma el controller desde la sesión.
 */
const getPaymentById = async ({ paymentId, scope }: { paymentId: number; scope: WriteScope }): Promise<PaymentDetail> => {
  const [row] = await DataBase.instance.sequelize.query<RawPaymentDetail>(
    `SELECT qp.id, qp.quotation_id, q.company_id, q.business_unit_id, c.name AS client_name, qp.amount, qp.method,
            qp.paid_at, qp.notes, qp.operation_number, qp.payment_account_id, pa.name AS payment_account_name,
            qp.is_deleted, q.total AS quotation_total,
            (SELECT COALESCE(SUM(o.amount), 0) FROM quotation_payment o
              WHERE o.quotation_id = qp.quotation_id AND o.is_deleted = false AND o.id <> qp.id) AS paid_by_others,
            ${correctionsCountSql("quotation_payment", "qp.id")} AS corrections_count
     FROM quotation_payment qp
     INNER JOIN quotation q ON q.id = qp.quotation_id
     INNER JOIN client c ON c.id = q.client_id
     LEFT JOIN general_variable pa ON pa.id = qp.payment_account_id
     WHERE qp.id = :paymentId`,
    { type: QueryTypes.SELECT, replacements: { paymentId } }
  );
  if (!row) throw new AppError(404, "El pago no existe");
  assertPaymentInWriteScope(row, scope);

  return {
    id: row.id,
    quotation_id: row.quotation_id,
    company_id: Number(row.company_id),
    business_unit_id: row.business_unit_id,
    client_name: row.client_name,
    amount: Number(row.amount),
    method: row.method,
    paid_at: row.paid_at,
    notes: row.notes,
    operation_number: row.operation_number,
    payment_account_id: row.payment_account_id,
    payment_account_name: row.payment_account_name,
    is_deleted: Boolean(row.is_deleted),
    quotation_total: Number(row.quotation_total),
    paid_by_others: Number(row.paid_by_others),
    corrections_count: Number(row.corrections_count),
  };
};

export { getPaymentById };
