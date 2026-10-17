import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

// Liquida TODA la deuda pendiente de un trabajador de una sola vez (se le
// pagó en efectivo/transferencia por fuera del sistema) — no tiene sentido
// marcar compra por compra si lo que se le paga es el total acumulado.
const markEmployeeDebtAsPaid = async ({
  userId,
  companyId,
  updatedBy,
}: {
  userId: number;
  companyId: number | null;
  updatedBy?: number;
}) => {
  const where: Record<string, unknown> = { user_id: userId, status: "pending" };
  if (companyId !== null) where.company_id = companyId;

  const [affectedRows] = await DataBase.instance.employee_debt.update(
    {
      status: "paid",
      paid_at: nowUtc().toISOString().slice(0, 10),
      updated_by: updatedBy ?? null,
      updated_at: nowUtc(),
    },
    { where }
  );

  return { affectedRows };
};

export { markEmployeeDebtAsPaid };
