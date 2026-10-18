import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { CashMovementAttributes } from "../../model/cash_movement.model";

export type CreateCashMovementDto = Pick<
  CashMovementAttributes,
  | "company_id"
  | "business_unit_id"
  | "direction"
  | "category"
  | "amount"
  | "description"
  | "occurred_at"
  | "quotation_id"
  | "purchase_order_id"
  | "payment_account_id"
>;

const createCashMovement = async ({
  movement,
  createdBy,
}: {
  movement: CreateCashMovementDto;
  createdBy?: number;
}) => {
  // Lista blanca explícita (nunca `...movement`): el controller ya arma el
  // DTO campo por campo, pero así el service tampoco depende de eso.
  return DataBase.instance.cash_movement.create({
    id: 0,
    company_id: movement.company_id,
    business_unit_id: movement.business_unit_id,
    direction: movement.direction,
    category: movement.category,
    amount: movement.amount,
    description: movement.description,
    occurred_at: movement.occurred_at,
    quotation_id: movement.quotation_id,
    purchase_order_id: movement.purchase_order_id,
    payment_account_id: movement.payment_account_id,
    is_deleted: false,
    created_by: createdBy ?? null,
    created_at: nowUtc(),
    updated_by: null,
    updated_at: null,
  });
};

export { createCashMovement };
