// Préstamos a personas (pedido del usuario, 21-nov).

export type LoanStatus = "pending" | "overdue" | "paid" | "annulled";
export const LOAN_STATUS_FILTERS: LoanStatus[] = ["pending", "overdue", "paid", "annulled"];

export interface LocalDateTime {
  date: string;
  time: string;
}

export interface LoanDto {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  borrower_name: string;
  borrower_document: string | null;
  borrower_phone: string | null;
  principal: number;
  interest_rate: number;
  interest_amount: number;
  total_due: number;
  // Cobros vigentes: total, cuánto fue interés y cuántos son.
  paid_amount: number;
  paid_interest: number;
  payments_count: number;
  balance: number;
  status: LoanStatus;
  loaned_at: string; // YYYY-MM-DD
  due_date: string | null;
  payment_account_id: number | null;
  payment_account_name: string | null;
  operation_number: string | null;
  notes: string | null;
  active: boolean;
  createdAt: LocalDateTime;
  created_by_name: string | null;
}

export interface LoanPaymentDto {
  id: number;
  loan_id: number;
  amount: number;
  principal_part: number;
  interest_part: number;
  paid_at: string; // YYYY-MM-DD
  payment_account_id: number | null;
  payment_account_name: string | null;
  operation_number: string | null;
  notes: string | null;
  active: boolean;
  createdAt: LocalDateTime;
  created_by_name: string | null;
}

export interface LoanDetailDto extends LoanDto {
  payments: LoanPaymentDto[];
}

export interface LoanListParams {
  // null = Super Administrador sin empresa elegida (ve todas).
  companyId: number | null;
  // Tienda a la que se limita el usuario (undefined = todas las de su empresa).
  businessUnitId?: number;
  status?: LoanStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

export interface LoanListSummary {
  // Lo que falta cobrar de los préstamos vigentes (con los mismos filtros).
  outstanding_balance: number;
  // Interés ya cobrado.
  interest_collected: number;
}

export interface CreateLoanInput {
  companyId: number;
  businessUnitId: number | null;
  borrowerName: string;
  borrowerDocument: string | null;
  borrowerPhone: string | null;
  principal: number;
  interestRate: number;
  loanedAt: string;
  dueDate: string | null;
  paymentAccountId: number | null;
  operationNumber: string | null;
  notes: string | null;
  actorId: number;
}

// Campos que se pueden cambiar; los de dinero (capital, %, fecha, cuenta)
// solo si el préstamo no tiene cobros.
export interface UpdateLoanInput {
  borrowerName?: string;
  borrowerDocument?: string | null;
  borrowerPhone?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  principal?: number;
  interestRate?: number;
  loanedAt?: string;
  paymentAccountId?: number | null;
  operationNumber?: string | null;
}

export interface CreateLoanPaymentInput {
  amount: number;
  paidAt: string;
  paymentAccountId: number | null;
  operationNumber: string | null;
  notes: string | null;
}
