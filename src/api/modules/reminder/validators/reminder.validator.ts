import { body, param, query } from "express-validator";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const hourMinute = /^([01]\d|2[0-3]):[0-5]\d$/;

const idParam = param("id").isInt({ gt: 0 }).withMessage("El id del recordatorio no es válido");

const reminderBody = [
  body("title")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("El título es obligatorio")
    .bail()
    .isLength({ max: 150 })
    .withMessage("Máximo 150 caracteres"),
  body("message").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  body("remind_date").matches(isoDate).withMessage("La fecha es obligatoria (YYYY-MM-DD)"),
  body("remind_time").matches(hourMinute).withMessage("La hora es obligatoria (HH:mm)"),
  body("recipient_user_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("El destinatario no es válido"),
];

export const createReminderValidator = reminderBody;
export const updateReminderValidator = [idParam, ...reminderBody];
export const reminderIdValidator = [idParam];

export const listRemindersValidator = [
  query("page").optional().isInt({ gt: 0 }).withMessage("La página debe ser un número entero positivo"),
  query("limit").optional().isInt({ gt: 0, max: 100 }).withMessage("El límite debe estar entre 1 y 100"),
  query("box").optional({ values: "falsy" }).isIn(["received", "sent"]).withMessage("Bandeja inválida"),
  query("status")
    .optional({ values: "falsy" })
    .isIn(["active", "upcoming", "due", "read", "cancelled"])
    .withMessage("Estado inválido"),
  query("dateFrom").optional({ values: "falsy" }).matches(isoDate).withMessage("Fecha inválida (YYYY-MM-DD)"),
  query("dateTo").optional({ values: "falsy" }).matches(isoDate).withMessage("Fecha inválida (YYYY-MM-DD)"),
];

export const recipientsValidator = [
  query("search").optional({ values: "falsy" }).isString().isLength({ max: 100 }).withMessage("Máximo 100 caracteres"),
];
