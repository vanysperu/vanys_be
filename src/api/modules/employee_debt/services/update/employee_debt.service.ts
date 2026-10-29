import { DataBase } from "../../../../../database";
import { nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";

export class InvalidPaymentAmountError extends Error {}

// Aplica un abono (total o parcial) a las deudas PENDIENTES más antiguas de
// un trabajador primero (FIFO) — pedido explícito de QA: antes solo se podía
// liquidar TODO de una vez, sin opción de reponer un monto menor (ej. S/50
// de una deuda de S/200).
//
// Cada fila de `employee_debt` sigue correspondiendo 1 a 1 a la compra que
// la generó (purchase_order_item_purchase_id es UNIQUE, nunca se parte una
// fila en dos): lo que cambia por abono es `paid_amount` dentro de esa misma
// fila. Una fila pasa a status="paid" recién cuando paid_amount alcanza a
// amount; mientras tanto sigue "pending" con su remanente
// (amount - paid_amount), que es lo único que un abono parcial más tarde
// puede seguir descontando.
//
// Queda registrado desde qué cuenta se repuso (null = efectivo) y en qué
// fecha en CADA fila tocada por este abono — así, igual que antes, cada
// gasto de esas compras aparece en Caja como "pagado por <trabajador> ·
// repuesto el <fecha> desde <cuenta>".
const markEmployeeDebtAsPaid = async ({
  userId,
  companyId,
  amount,
  paymentAccountId,
  updatedBy,
}: {
  userId: number;
  companyId: number | null;
  // Monto a abonar ahora; debe ser > 0 y no puede superar el total
  // pendiente del trabajador.
  amount: number;
  paymentAccountId: number | null;
  updatedBy?: number;
}) => {
  const where: Record<string, unknown> = { user_id: userId, status: "pending" };
  if (companyId !== null) where.company_id = companyId;

  const transaction = await DataBase.instance.sequelize.transaction();

  try {
    // Las más antiguas primero: es lo que un trabajador esperaría que se le
    // repusiera antes si el abono no alcanza para todo.
    const pendingDebts = await DataBase.instance.employee_debt.findAll({
      where,
      order: [["created_at", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const totalPending = pendingDebts.reduce((sum, debt) => sum + (Number(debt.amount) - Number(debt.paid_amount)), 0);
    if (amount <= 0 || amount > totalPending + 0.009) {
      throw new InvalidPaymentAmountError(
        `El monto a reponer no puede ser mayor al total pendiente (S/ ${totalPending.toFixed(2)})`
      );
    }

    const paidAt = todayInBusinessTz();
    const updatedAt = nowUtc();
    let remainingBudget = amount;
    let affectedRows = 0;

    for (const debt of pendingDebts) {
      if (remainingBudget <= 0) break;

      const debtRemaining = Number(debt.amount) - Number(debt.paid_amount);
      const amountToApply = Math.min(debtRemaining, remainingBudget);
      const newPaidAmount = Number(debt.paid_amount) + amountToApply;
      const isFullyPaid = newPaidAmount >= Number(debt.amount) - 0.009;

      await debt.update(
        {
          paid_amount: isFullyPaid ? debt.amount : newPaidAmount,
          status: isFullyPaid ? "paid" : "pending",
          paid_at: paidAt,
          payment_account_id: paymentAccountId,
          updated_by: updatedBy ?? null,
          updated_at: updatedAt,
        },
        { transaction }
      );

      remainingBudget -= amountToApply;
      affectedRows += 1;
    }

    await transaction.commit();
    return { affectedRows, amountApplied: amount };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export { markEmployeeDebtAsPaid };
