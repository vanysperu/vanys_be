import { IToken } from "../../../interfaces/IToken.interface";
import { resolveBusinessUnitFilter } from "../../../../core/rbac/businessUnitScope";
import { InvoiceActor } from "../types/invoice.types";

// Quién hace la acción y a qué tienda está limitado, desde la sesión.
export const invoiceActorOf = (user: IToken): InvoiceActor => ({
  userId: user.userId,
  isSystem: user.isSystem,
  companyId: user.companyId,
  businessUnitId: resolveBusinessUnitFilter(user),
  writeBusinessUnitId: user.isSystem || user.businessUnitId === null ? undefined : user.businessUnitId,
});
