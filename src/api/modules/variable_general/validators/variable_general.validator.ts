import { body, param, query } from "express-validator";

// 🧩 Validar parámetro "id"
export const idValidator = [
  param("id")
    .isInt({ gt: 0 })
    .withMessage("El identificador proporcionado no es válido. Debe ser un número entero positivo."),
];

// 🔍 Validar filtros y paginación
export const paginationAndFilterValidator = [
  query("page")
    .optional()
    .isInt({ gt: 0 })
    .toInt()
    .withMessage("El número de página debe ser un número entero mayor que 0."),
  query("limit")
    .optional()
    .isInt({ gt: 0 })
    .toInt()
    .withMessage("El límite de resultados debe ser un número entero mayor que 0."),
  query("search")
    .optional()
    .isString()
    .trim()
    .withMessage("El parámetro de búsqueda debe ser un texto válido."),
  query("category")
    .optional()
    .isString()
    .trim()
    .withMessage("La categoría debe ser un texto válido."),
  query("admin")
    .optional()
    .isBoolean()
    .withMessage("El parámetro 'admin' debe ser un booleano."),
];

// ✨ Validar creación de registro
// Columnas STRING(255) en DB (create-variable-general.js) — sin este tope,
// un valor muy largo produce el mismo error crudo de MySQL (mismo motivo
// documentado en quotation.validator.ts).
export const createVariableGeneralValidator = [
  body("category")
    .isString()
    .notEmpty()
    .withMessage("El campo 'category' es obligatorio y debe ser un texto.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("title")
    .isString()
    .notEmpty()
    .withMessage("El campo 'title' es obligatorio y debe ser un texto.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("prefix_id")
    .isString()
    .notEmpty()
    .withMessage("El campo 'prefix_id' es obligatorio y debe ser un texto.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("name")
    .isString()
    .notEmpty()
    .withMessage("El campo 'name' es obligatorio y debe ser un texto.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("description")
    .optional()
    .isString()
    .withMessage("La descripción debe ser un texto.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("ref1")
    .optional()
    .isString()
    .withMessage("El campo 'ref1' debe ser un texto válido.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("ref2")
    .optional()
    .isString()
    .withMessage("El campo 'ref2' debe ser un texto válido.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
];

// ✏️ Validar actualización de registro
export const updateVariableGeneralValidator = [
  body("category")
    .optional()
    .isString()
    .withMessage("El campo 'category' debe ser un texto válido.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("title")
    .optional()
    .isString()
    .withMessage("El campo 'title' debe ser un texto válido.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("prefix_id")
    .optional()
    .isString()
    .withMessage("El campo 'prefix_id' debe ser un texto válido.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("name")
    .optional()
    .isString()
    .withMessage("El campo 'name' debe ser un texto válido.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("description")
    .optional()
    .isString()
    .withMessage("El campo 'description' debe ser un texto válido.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("ref1")
    .optional()
    .isString()
    .withMessage("El campo 'ref1' debe ser un texto válido.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("ref2")
    .optional()
    .isString()
    .withMessage("El campo 'ref2' debe ser un texto válido.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
];
