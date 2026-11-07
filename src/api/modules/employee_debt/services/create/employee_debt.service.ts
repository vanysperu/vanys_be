import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { formatSoles, fromCents, toCents } from "../../../../../core/utils/money";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { assertCashPeriodOpen } from "../../../../../core/money/cashPeriod";

export class DuplicateManualDebtError extends Error {}

// Ventana para detectar un doble envío del mismo formulario (doble clic,
// reintento de red): una deuda idéntica registrada hace menos de esto.
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export interface CreateManualEmployeeDebtInput {
  companyId: number;
  businessUnitId: number | null;
  userId: number;
  description: string;
  category: string;
  amount: number;
  incurredAt: string;
  createdBy: number;
}

// Deuda MANUAL con un trabajador (pedido explícito del usuario: "si un
// empleado fue a pagar los servicios y los pagó de su plata"). Es un gasto de
// la empresa pagado con dinero ajeno: no mueve Caja al registrarse; el
// egreso será la reposición, igual que con una compra de orden pagada con
// plata propia. Lo valida todo el controller (trabajador activo de la misma
// empresa, categoría del catálogo, tienda de la empresa); acá se protege
// contra el doble registro y se deja rastro en `log`.
const createManualEmployeeDebt = async (input: CreateManualEmployeeDebtInput) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Bloqueo del trabajador: dos registros simultáneos para la misma
    // persona se serializan y el segundo ve al primero (si no, ambos
    // pasaban el chequeo de duplicado a la vez).
    await DataBase.instance.user.findOne({ where: { id: input.userId }, transaction, lock: transaction.LOCK.UPDATE });

    const amount = fromCents(toCents(input.amount));
    const duplicate = await DataBase.instance.employee_debt.findOne({
      where: {
        company_id: input.companyId,
        user_id: input.userId,
        origin: "manual",
        status: { [Op.ne]: "cancelled" },
        amount,
        incurred_at: input.incurredAt,
        description: input.description,
        created_at: { [Op.gte]: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      transaction,
    });
    if (duplicate) {
      throw new DuplicateManualDebtError(
        "Esta deuda ya se registró hace un momento (misma persona, monto, fecha y descripción)."
      );
    }

    // Cierre de caja (fase 2): la deuda no mueve caja, pero su fecha cae en
    // un período.
    await assertCashPeriodOpen({
      companyId: input.companyId,
      date: input.incurredAt,
      source: "employee_debt",
      movesCash: false,
      transaction,
    });

    const now = nowUtc();
    const debt = await DataBase.instance.employee_debt.create(
      {
        id: 0,
        company_id: input.companyId,
        user_id: input.userId,
        origin: "manual",
        purchase_order_item_purchase_id: null,
        quotation_expense_id: null,
        description: input.description,
        category: input.category,
        business_unit_id: input.businessUnitId,
        incurred_at: input.incurredAt,
        amount,
        paid_amount: 0,
        status: "pending",
        paid_at: null,
        payment_account_id: null,
        created_by: input.createdBy,
        created_at: now,
        updated_by: input.createdBy,
        updated_at: now,
      },
      { transaction }
    );

    await createLogService(
      {
        user_id: input.createdBy,
        action: LogAction.CREATE,
        module: "employee_debt",
        description: `Registró una deuda manual #${debt.id} de ${formatSoles(amount)} con el trabajador #${input.userId}: ${input.description}`,
        company_id: input.companyId,
      },
      transaction
    );

    return debt;
  });
};

export { createManualEmployeeDebt };
