import { AppError } from "../../../../../core/errors/AppError";
import { isOutOfWriteScope, WriteScope } from "../../../../../core/rbac/writeScope";

// Empresa y tienda de un pago: son las de su cotización (el pago no las
// guarda sueltas).
export interface PaymentOwner {
  company_id: number;
  business_unit_id: number | null;
}

// Alcance de ESCRITURA sobre un pago. Se mantiene el 403 histórico del módulo
// cuando el pago existe pero es de OTRA empresa; una tienda ajena dentro de
// la misma empresa responde 404 (no se confirma que ese pago exista).
export const assertPaymentInWriteScope = (owner: PaymentOwner, scope: WriteScope): void => {
  if (scope.companyId !== null && Number(owner.company_id) !== scope.companyId) {
    throw new AppError(403, "No tienes acceso a este pago");
  }
  if (isOutOfWriteScope(owner, scope)) throw new AppError(404, "El pago no existe");
};
