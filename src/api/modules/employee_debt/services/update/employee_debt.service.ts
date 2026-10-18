import { DataBase } from "../../../../../database";
import { nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";

// Liquida TODA la deuda pendiente de un trabajador de una sola vez — no tiene
// sentido marcar compra por compra si lo que se le repone es el total
// acumulado. Queda registrado desde qué cuenta se le repuso (null =
// efectivo) y en qué fecha: con eso, cada gasto de esas compras aparece en
// Caja como "pagado por <trabajador> · repuesto el <fecha> desde <cuenta>".
const markEmployeeDebtAsPaid = async ({
  userId,
  companyId,
  paymentAccountId,
  updatedBy,
}: {
  userId: number;
  companyId: number | null;
  paymentAccountId: number | null;
  updatedBy?: number;
}) => {
  const where: Record<string, unknown> = { user_id: userId, status: "pending" };
  if (companyId !== null) where.company_id = companyId;

  const [affectedRows] = await DataBase.instance.employee_debt.update(
    {
      status: "paid",
      // Día calendario de Lima: antes era el día UTC, así que una reposición
      // hecha después de las 7 p. m. quedaba con fecha de mañana.
      paid_at: todayInBusinessTz(),
      payment_account_id: paymentAccountId,
      updated_by: updatedBy ?? null,
      updated_at: nowUtc(),
    },
    { where }
  );

  return { affectedRows };
};

export { markEmployeeDebtAsPaid };
