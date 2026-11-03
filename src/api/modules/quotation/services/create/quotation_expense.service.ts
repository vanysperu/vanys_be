import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { assertCashPeriodOpen } from "../../../../../core/money/cashPeriod";
import { logQuotationEvent, truncateForTimeline } from "../timeline/quotation_event.service";
import { assertQuotationIsActive } from "../shared/active_quotation";

export interface CreateQuotationExpenseInput {
  description: string;
  amount: number;
  category?: string | null;
  spent_at: string;
  // Cuenta de la empresa desde la que se pagó, ya validada (null = efectivo).
  payment_account_id?: number | null;
}

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
  const run = async (t: Transaction) => {
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
    await assertCashPeriodOpen({
      companyId: quotation.company_id,
      date: input.spent_at,
      source: "quotation_expense",
      movesCash,
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
        payment_account_id: input.payment_account_id ?? null,
        is_deleted: false,
        created_by: createdBy ?? null,
        created_at: nowUtc(),
        updated_by: null,
        updated_at: null,
      },
      { transaction: t }
    );

    await logQuotationEvent({
      quotationId,
      action: "expense_added",
      description: `Gasto registrado: "${truncateForTimeline(input.description)}" por S/ ${Number(input.amount).toFixed(2)}`,
      actorId: createdBy,
      transaction: t,
    });

    return expense;
  };

  if (transaction) return run(transaction);
  return DataBase.instance.sequelize.transaction(run);
};

export { createQuotationExpense };
