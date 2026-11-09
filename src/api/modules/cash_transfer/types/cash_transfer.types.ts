import { WriteScope } from "../../../../core/rbac/writeScope";

// Entrada del service de crear (el controller ya resolvió empresa, tienda y
// cuentas contra la sesión; nunca confía en lo que mande el body).
export interface CreateCashTransferInput {
  companyId: number;
  businessUnitId: number | null;
  fromPaymentAccountId: number | null; // null = Efectivo
  toPaymentAccountId: number | null;
  amount: number;
  occurredAt: string; // YYYY-MM-DD
  description: string | null;
  operationNumber: string | null;
  actorId: number;
}

// Corrección: campo ausente = se queda como está; en las cuentas, null =
// Efectivo. `reason` es obligatorio (queda en el log inmutable).
export interface UpdateCashTransferChanges {
  amount?: number;
  occurred_at?: string;
  from_payment_account_id?: number | null;
  to_payment_account_id?: number | null;
  description?: string | null;
  operation_number?: string | null;
}

export interface UpdateCashTransferInput {
  transferId: number;
  changes: UpdateCashTransferChanges;
  reason: string;
  scope: WriteScope;
  actorId: number;
}

export interface DisableCashTransferInput {
  transferId: number;
  scope: WriteScope;
  actorId: number;
}

export interface CashTransferListFilter {
  companyId: number | null; // null = Super Administrador sin empresa elegida
  businessUnitId?: number;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
  orderDir: "asc" | "desc";
}

// Una transferencia hacia el cliente (GET /cash-movement/transfer/list y
// respuestas de crear/corregir/anular).
export interface CashTransferItem {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  from_payment_account_id: number | null;
  from_account_name: string; // "Efectivo" si es null
  to_payment_account_id: number | null;
  to_account_name: string;
  amount: number;
  occurred_at: string;
  description: string | null;
  operation_number: string | null;
  is_deleted: boolean;
  created_at: { date: string; time: string };
  updated_at: { date: string; time: string };
}
