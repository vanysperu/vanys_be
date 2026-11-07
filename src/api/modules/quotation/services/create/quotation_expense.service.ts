import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { assertCashPeriodOpen } from "../../../../../core/money/cashPeriod";
import { logQuotationEvent, truncateForTimeline } from "../timeline/quotation_event.service";
import { assertQuotationIsActive } from "../shared/active_quotation";
import { toNullableText } from "../../../money_correction/services/shared/correction_diff";
import { AppError } from "../../../../../core/errors/AppError";
import { recalculateDebtsState } from "../../../employee_debt/services/shared/debt_state.service";
import { assertEmployeeAvailable } from "../../../employee_debt/services/shared/funded_debt";
import { userDisplayName } from "../../../purchase_order/services/shared/purchase_lock.service";
import { FundingSource } from "../../../purchase_order/model/purchase_order_item_purchase.model";
import { syncExpenseDebt } from "../shared/expense_debt";

export interface CreateQuotationExpenseInput {
  description: string;
  amount: number;
  category?: string | null;
  spent_at: string;
  // Cuenta de la empresa desde la que se pagó, ya validada (null = efectivo).
  payment_account_id?: number | null;
  operation_number?: string | null;
  // Plata de un trabajador: nace su deuda y no sale de Caja hasta reponerle. Solo
  // en un gasto manual: en una compra lo resuelve la compra.
  funding_source?: FundingSource;
  paid_by_user_id?: number | null;
}

// Un gasto con plata de un trabajador no sale de ninguna cuenta de la empresa.
const assertNoCompanyPaymentData = (input: CreateQuotationExpenseInput) => {
  if (input.payment_account_id) {
    throw new AppError(400, "Un gasto pagado con plata de un trabajador no sale de una cuenta de la empresa", undefined, "PAYMENT_ACCOUNT_NOT_ALLOWED");
  }
  if (toNullableText(input.operation_number)) {
    throw new AppError(400, "Un gasto pagado con plata de un trabajador no lleva número de operación: va en su reposición", undefined, "OPERATION_NUMBER_NOT_ALLOWED");
  }
};

// Escribe en 2 tablas (quotation_expense, quotation_event). Si el caller ya
// tiene una transacción abierta (ej. purchase_order_item_purchase.service.ts)
// la reutiliza; si no, abre una propia para que ambas escrituras sean
// todo-o-nada.
const createQuotationExpense = async ({
  quotationId,
  input,
  createdBy,
  transaction,
  movesCash = true,
}: {
  quotationId: number;
  input: CreateQuotationExpenseInput;
  createdBy?: number;
  transaction?: Transaction;
  // false = gasto de una compra pagada con plata de un trabajador: no mueve
  // la caja de la empresa (su egreso es la reposición). Solo informa al
  // gancho de cierre de caja.
  movesCash?: boolean;
}) => {
  const fundingSource = input.funding_source ?? "company";
  const paidByUserId = fundingSource === "employee" ? (input.paid_by_user_id ?? createdBy ?? null) : null;

  const run = async (t: Transaction) => {
    if (fundingSource === "employee") assertNoCompanyPaymentData(input);

    // Solo en una cotización aceptada o en curso (con lock: no se cuela un
    // gasto en una cotización que se está cancelando).
    await assertQuotationIsActive(quotationId, "registrar un gasto", t);

    // Cierre de caja (fase 2): el mes del gasto tiene que estar abierto.
    const quotation = await DataBase.instance.quotation.findOne({
      where: { id: quotationId },
      attributes: ["id", "company_id"],
      transaction: t,
    });
    if (!quotation) throw new Error("La cotización no existe");
    if (fundingSource === "employee") await assertEmployeeAvailable(paidByUserId, quotation.company_id, t);
    await assertCashPeriodOpen({
      companyId: quotation.company_id,
      date: input.spent_at,
      source: "quotation_expense",
      movesCash: movesCash && fundingSource === "company",
      transaction: t,
    });

    const expense = await DataBase.instance.quotation_expense.create(
      {
        id: 0,
        quotation_id: quotationId,
        description: input.description,
        amount: input.amount,
        category: input.category ?? null,
        spent_at: input.spent_at,
        funding_source: fundingSource,
        payment_account_id: input.payment_account_id ?? null,
        operation_number: toNullableText(input.operation_number),
        is_deleted: false,
        created_by: createdBy ?? null,
        created_at: nowUtc(),
        updated_by: null,
        updated_at: null,
      },
      { transaction: t }
    );

    const debtId = await (fundingSource === "employee"
      ? syncExpenseDebt({
          expenseId: expense.id,
          companyId: quotation.company_id,
          debt: null,
          target: { funding_source: fundingSource, paid_by_user_id: paidByUserId, amount: input.amount, spent_at: input.spent_at },
          actorId: createdBy ?? null,
          transaction: t,
        })
      : null);
    if (debtId !== null) await recalculateDebtsState([debtId], t, createdBy ?? 0);
    const paidByNote = fundingSource === "employee" ? ` (lo pagó ${await userDisplayName(paidByUserId, t)} con su plata)` : "";

    await logQuotationEvent({
      quotationId,
      action: "expense_added",
      description: `Gasto registrado: "${truncateForTimeline(input.description)}" por S/ ${Number(input.amount).toFixed(2)}${paidByNote}`,
      actorId: createdBy,
      transaction: t,
    });

    return expense;
  };

  if (transaction) return run(transaction);
  return DataBase.instance.sequelize.transaction(run);
};

export { createQuotationExpense };
