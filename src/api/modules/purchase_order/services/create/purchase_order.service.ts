import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { QuotationItemModel } from "../../../quotation/model/quotation_item.model";
import { BusinessUnitAttributes } from "../../../business_unit/models/business_unit.models";

// El `include` de business_unit no está declarado en `UserModel` (limitación
// de los tipos de Sequelize con asociaciones), por eso se tipa acá el shape
// mínimo que realmente se pide en el `attributes` del include.
type AssigneeWithBusinessUnit = {
  company_id?: number | null;
  business_unit?: Pick<BusinessUnitAttributes, "id" | "company_id"> | null;
};

// Un admin de empresa no debe poder crear una orden de compra que
// referencie la cotización/usuario de OTRA empresa (CLAUDE.md sección 10),
// aunque conozca sus ids — el controller ya fuerza company_id al de su
// token, pero eso solo protege la orden en sí, no lo que referencia.
export class TenantMismatchError extends Error {}

export interface CreatePurchaseOrderItemInput {
  quotation_item_id: number;
  quantity: number;
}

export interface CreatePurchaseOrderInput {
  company_id: number;
  quotation_id: number;
  assigned_to: number;
  notes?: string | null;
  items: CreatePurchaseOrderItemInput[];
}

const createPurchaseOrder = async ({
  input,
  createdBy,
  callerBusinessUnitId,
}: {
  input: CreatePurchaseOrderInput;
  createdBy?: number;
  // Tienda a la que está limitado el caller (ver core/rbac/businessUnitScope.ts)
  // — undefined = sin límite de tienda.
  callerBusinessUnitId?: number;
}) => {
  const transaction = await DataBase.instance.sequelize.transaction();

  try {
    const quotation = await DataBase.instance.quotation.findOne({ where: { id: input.quotation_id }, transaction });
    if (!quotation) throw new Error(`La cotización ${input.quotation_id} no existe`);
    if (quotation.company_id !== input.company_id) {
      throw new TenantMismatchError("La cotización seleccionada no pertenece a esta empresa");
    }
    if (callerBusinessUnitId !== undefined && quotation.business_unit_id !== callerBusinessUnitId) {
      throw new TenantMismatchError("La cotización seleccionada no pertenece a tu tienda");
    }

    // Un admin de empresa no tiene tienda asignada (business_unit_id NULL)
    // pero sí su propio company_id directo (ver migración
    // 20260927100000-add-company-id-to-user — mismo COALESCE que ya usa
    // getUserTenantInfo en users/services/find/user.service.ts); resolver
    // solo vía business_unit dejaba a CUALQUIER admin asignado siempre
    // "fuera de la empresa" (bug real: bloqueaba asignarle una orden de
    // compra a sí mismo o a otro admin).
    const assignee = await DataBase.instance.user.findOne({
      where: { id: input.assigned_to },
      include: [{ association: "business_unit", attributes: ["id", "company_id"] }],
      transaction,
    });
    if (!assignee) throw new Error(`El usuario ${input.assigned_to} no existe`);
    const typedAssignee = assignee as unknown as AssigneeWithBusinessUnit;
    const assigneeCompanyId = typedAssignee.business_unit?.company_id ?? typedAssignee.company_id ?? null;
    if (assigneeCompanyId !== input.company_id) {
      throw new TenantMismatchError("El usuario asignado no pertenece a esta empresa");
    }

    const quotationItemIds = input.items.map((item) => item.quotation_item_id);
    const quotationItems = await DataBase.instance.quotation_item.findAll({
      where: { id: quotationItemIds },
      transaction,
    });

    for (const item of input.items) {
      const quotationItem = quotationItems.find((row: QuotationItemModel) => row.id === item.quotation_item_id);
      if (!quotationItem) throw new Error(`El item ${item.quotation_item_id} no existe`);
      if (quotationItem.quotation_id !== input.quotation_id) {
        throw new TenantMismatchError(`El item ${item.quotation_item_id} no pertenece a esta cotización`);
      }
    }

    const purchaseOrder = await DataBase.instance.purchase_order.create(
      {
        id: 0,
        company_id: input.company_id,
        quotation_id: input.quotation_id,
        assigned_to: input.assigned_to,
        status: "pending",
        notes: input.notes ?? null,
        purchased_at: null,
        created_by: createdBy ?? null,
        created_at: nowUtc(),
        updated_by: null,
        updated_at: null,
      },
      { transaction }
    );

    await DataBase.instance.purchase_order_item.bulkCreate(
      input.items.map((item) => ({
        id: 0,
        purchase_order_id: purchaseOrder.id,
        quotation_item_id: item.quotation_item_id,
        quantity: item.quantity,
        status: "pending" as const,
        created_by: createdBy,
        created_at: nowUtc(),
      })),
      { transaction }
    );

    await transaction.commit();
    return purchaseOrder;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export { createPurchaseOrder };
