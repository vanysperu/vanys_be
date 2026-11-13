import { body, param } from "express-validator";
import { moneyAmountRule, moneyDateRule } from "../../../../core/validators/money.validator";
import {
  correctionHistoryValidator,
  correctionIdParamRule,
  correctionReasonRule,
  operationNumberRule,
} from "../../money_correction/validators/money_correction.validator";
import { DataBase } from "../../../../database";
import { optionalAdjustmentReasonRule } from "../../cash_movement/validators/adjustment_reason.validator";

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
  moneyAmountRule("amount"),
  body("notes").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  // Cuenta de la empresa desde la que se pagó (vacío = efectivo). Que sea de
  // la empresa de la orden y esté activa lo valida el service. Si la pagó un
  // trabajador con su plata, no sale de ninguna cuenta de la empresa: ese
  // dinero sale recién al reponerle (Deudas a personal).
  body("payment_account_id")
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("La cuenta seleccionada no es válida")
    .bail()
    .custom((value: unknown, { req }) => {
      if (req.body.funding_source !== "employee") return true;
      throw new Error("Una compra pagada con plata del trabajador no sale de una cuenta de la empresa");
    }),
  // Plata de un trabajador: el número va en la reposición, cuando sale el dinero.
  operationNumberRule().custom((value: unknown, { req }) => {
    if (!value || req.body.funding_source !== "employee") return true;
    throw new Error("Una compra pagada con plata del trabajador no lleva número de operación: va en su reposición");
  }),
  body("allow_exceed").optional().isBoolean().withMessage("allow_exceed debe ser verdadero o falso"),
  body("warehouse_id").optional({ values: "null" }).isInt({ min: 1 }).withMessage("El almacén no es válido"),
  // ¿La compra llevaba factura? (el archivo se sube aparte, POST /invoice/:id/file).
  body("has_invoice").optional().isBoolean().withMessage("has_invoice debe ser verdadero o falso").toBoolean(),
  // "Sí, llega después" (Sprint 2, ítem 3): sin factura todavía, queda en la bandeja.
  body("invoice_pending")
    .optional()
    .isBoolean()
    .withMessage("invoice_pending debe ser verdadero o falso")
    .toBoolean()
    .custom((value: boolean, { req }) => {
      if (!value || req.body.has_invoice !== true) return true;
      throw new Error("Una compra con factura no puede quedar con la factura pendiente");
    }),
  // Factura de compra ya registrada a la que se suma esta compra (varias compras, una factura).
  body("invoice_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La factura elegida no es válida").toInt(),
  body("funding_source")
    .isIn(["company", "employee"])
    .withMessage("El origen de los fondos debe ser 'company' o 'employee'"),
  body("paid_by_user_id")
    .if(body("funding_source").equals("employee"))
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("El trabajador debe ser un id válido")
    .bail(),
  // Este chequeo corre SIEMPRE que funding_source sea "employee", mande o
  // no `paid_by_user_id` explícito: si no se manda, el controller asume
  // como "trabajador" a quien registra la compra (req.user). Antes solo se
  // validaba el caso explícito, así que un Super Administrador (is_system,
  // sin empresa) podía registrar una compra con fondos propios sin pasar
  // paid_by_user_id y generarse a sí mismo una `employee_debt` imposible de
  // pagar después (el pago exige que el trabajador pertenezca a una
  // empresa) — bug reportado por QA. El `custom` valida que el trabajador
  // exista, esté activo, y pertenezca a la MISMA empresa dueña de la orden
  // de compra.
  body("funding_source").custom(async (value: string, { req }) => {
    if (value !== "employee") return true;

    const authUser = req.user as { userId: number } | undefined;
    const employeeId = Number(req.body.paid_by_user_id ?? authUser?.userId);
    const employee = await DataBase.instance.user.findOne({ where: { id: employeeId } });
    if (!employee || employee.is_deleted || !employee.status) {
      throw new Error("El trabajador que puso el dinero no existe o está deshabilitado");
    }

    const item = await DataBase.instance.purchase_order_item.findOne({ where: { id: Number(req.params?.itemId) } });
    if (!item) throw new Error("El item de la orden de compra no existe");
    const purchaseOrder = await DataBase.instance.purchase_order.findOne({ where: { id: item.purchase_order_id } });
    if (!purchaseOrder) throw new Error("La orden de compra no existe");

    if (employee.company_id !== purchaseOrder.company_id) {
      throw new Error("El trabajador que puso el dinero no pertenece a la empresa de esta orden de compra");
    }
    return true;
  }),
];

// ---- Corrección / anulación de compras ----

// Solo la FORMA del id: existencia y alcance los resuelve el service (un id
// ajeno responde 404, igual que uno que no existe).
export const purchaseIdValidator = [correctionIdParamRule("id")];

// PUT /purchase-order/purchase/disable/:id — motivo opcional: obligatorio solo
// si la compra (pagada por la empresa) es de un mes cerrado: se registra como
// ajuste (cierre de caja).
export const annulPurchaseValidator = [correctionIdParamRule("id"), optionalAdjustmentReasonRule()];

const presentIn = (field: string) => body(field).exists();

// PUT /purchase-order/purchase/update/:id — cada campo es opcional (ausente =
// se queda como está). Las reglas cruzadas (cuenta solo con plata de la
// empresa, trabajador activo de la empresa, deuda ya repuesta) las aplica el
// service con los valores ya bloqueados.
export const correctPurchaseValidator = [
  correctionIdParamRule("id"),
  // El item (y con él la cotización) de una compra no se corrige: se anula y
  // se registra la correcta.
  body(["purchase_order_item_id", "item_id", "quotation_id"])
    .not()
    .exists()
    .withMessage("El producto de una compra no se corrige: anula esta compra y registra la correcta"),
  moneyAmountRule("amount", "El monto debe ser mayor a 0", { onlyIf: presentIn("amount") }),
  body("quantity").optional().isInt({ gt: 0 }).withMessage("La cantidad comprada debe ser un número entero positivo"),
  body("funding_source")
    .optional()
    .isIn(["company", "employee"])
    .withMessage("El origen de los fondos debe ser 'company' o 'employee'"),
  body("paid_by_user_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("El trabajador debe ser un id válido"),
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta seleccionada no es válida"),
  operationNumberRule(),
  moneyDateRule("spent_at", "La fecha de la compra no es válida", { onlyIf: presentIn("spent_at") }),
  body("allow_exceed").optional().isBoolean().withMessage("allow_exceed debe ser verdadero o falso"),
  // ¿Llevaba factura? invoice_id = pasarla a esa factura ya registrada.
  body("has_invoice").optional().isBoolean().withMessage("has_invoice debe ser verdadero o falso").toBoolean(),
  body("invoice_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La factura elegida no es válida").toInt(),
  correctionReasonRule(),
];

// GET /purchase-order/purchase/:id/corrections?page=&limit=
export { correctionHistoryValidator as purchaseCorrectionsValidator };
