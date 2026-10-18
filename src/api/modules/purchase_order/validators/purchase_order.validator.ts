import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

export const createPurchaseOrderValidator = [
  body("company_id").not().isEmpty().withMessage("La empresa es obligatoria").bail().isInt({ gt: 0 }),
  body("quotation_id").not().isEmpty().withMessage("La cotización es obligatoria").bail().isInt({ gt: 0 }),
  body("assigned_to").not().isEmpty().withMessage("Selecciona a quién se le asigna").bail().isInt({ gt: 0 }),
  body("notes").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  body("items").isArray({ min: 1 }).withMessage("La orden debe tener al menos un producto"),
  body("items.*.quotation_item_id").isInt({ gt: 0 }).withMessage("Cada producto necesita un item válido"),
  body("items.*.quantity").isInt({ gt: 0 }).withMessage("La cantidad debe ser un número entero positivo"),
];

export const purchaseOrderIdValidator = [
  param("id")
    .not()
    .isEmpty()
    .withMessage("El id de la orden de compra es obligatorio")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("El id debe ser un número entero positivo"),
];

const itemIdParamValidator = param("itemId")
  .not()
  .isEmpty()
  .withMessage("El id del item es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id del item debe ser un número entero positivo");

export const updatePurchaseOrderItemStatusValidator = [
  itemIdParamValidator,
  // "purchased" no se acepta acá — solo se llega ahí registrando una
  // compra con su monto (ver createPurchaseOrderItemPurchaseValidator).
  body("status").isIn(["pending", "not_needed"]).withMessage("Estado inválido"),
];

export const createPurchaseOrderItemPurchaseValidator = [
  itemIdParamValidator,
  body("quantity").isInt({ gt: 0 }).withMessage("La cantidad comprada debe ser un número entero positivo"),
  body("amount").isFloat({ gt: 0, max: 99999999.99 }).withMessage("El monto debe ser mayor a 0"),
  body("notes").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  body("allow_exceed").optional().isBoolean().withMessage("allow_exceed debe ser verdadero o falso"),
  body("funding_source")
    .isIn(["company", "employee"])
    .withMessage("El origen de los fondos debe ser 'company' o 'employee'"),
  // Obligatorio solo cuando es plata del trabajador — si no se manda, el
  // controller asume que quien registra la compra es quien puso el dinero.
  // El `custom` valida que el trabajador exista, esté activo, y pertenezca
  // a la MISMA empresa dueña de la orden de compra — sin esto, cualquiera
  // podía generarle una deuda (`employee_debt`) real a un usuario de OTRA
  // empresa, o a un usuario deshabilitado, con solo adivinar su id.
  body("paid_by_user_id")
    .if(body("funding_source").equals("employee"))
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("El trabajador debe ser un id válido")
    .bail()
    .custom(async (value: number, { req }) => {
      const employee = await DataBase.instance.user.findOne({ where: { id: Number(value) } });
      if (!employee || employee.is_deleted || !employee.status) {
        throw new Error("El trabajador seleccionado no existe o está deshabilitado");
      }

      const item = await DataBase.instance.purchase_order_item.findOne({ where: { id: Number(req.params?.itemId) } });
      if (!item) throw new Error("El item de la orden de compra no existe");
      const purchaseOrder = await DataBase.instance.purchase_order.findOne({ where: { id: item.purchase_order_id } });
      if (!purchaseOrder) throw new Error("La orden de compra no existe");

      if (employee.company_id !== purchaseOrder.company_id) {
        throw new Error("El trabajador seleccionado no pertenece a la empresa de esta orden de compra");
      }
      return true;
    }),
];
