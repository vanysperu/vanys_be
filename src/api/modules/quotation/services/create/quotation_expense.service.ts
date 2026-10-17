import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { logQuotationEvent, truncateForTimeline } from "../timeline/quotation_event.service";

export interface CreateQuotationExpenseInput {
  description: string;
  amount: number;
  category?: string | null;
  spent_at: string;
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
}: {
  quotationId: number;
  input: CreateQuotationExpenseInput;
  createdBy?: number;
  transaction?: Transaction;
}) => {
  const run = async (t: Transaction) => {
    const expense = await DataBase.instance.quotation_expense.create(
      {
        id: 0,
        quotation_id: quotationId,
        description: input.description,
        amount: input.amount,
        category: input.category ?? null,
        spent_at: input.spent_at,
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
