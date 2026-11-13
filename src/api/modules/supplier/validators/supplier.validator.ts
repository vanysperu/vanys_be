import { body, param, query } from "express-validator";

const idParam = param("id").isInt({ min: 1 }).withMessage("El proveedor no es válido").toInt();

const optionalText = (field: string, max: number, label: string) =>
  body(field)
    .optional({ values: "null" })
    .isString()
    .withMessage(`${label} no es válido`)
    .trim()
    .isLength({ max })
    .withMessage(`${label}: máximo ${max} caracteres`);

const supplierBody = [
  body("name").isString().trim().isLength({ min: 1, max: 200 }).withMessage("El nombre es obligatorio (máximo 200 caracteres)"),
  body("document_type").optional({ values: "null" }).isInt({ min: 1 }).withMessage("El tipo de documento no es válido").toInt(),
  body("document_number")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .matches(/^[A-Za-z0-9-]{1,20}$/)
    .withMessage("El número de documento solo admite letras, números y guiones (máximo 20)"),
  optionalText("trade_name", 200, "El nombre comercial"),
  body("email").optional({ values: "falsy" }).isEmail().withMessage("El correo no es válido").isLength({ max: 150 }),
  body("phone")
    .optional({ values: "falsy" })
    .matches(/^\+?[0-9 ]{6,20}$/)
    .withMessage("El teléfono solo admite números (y + al inicio)"),
  optionalText("address", 255, "La dirección"),
  body("is_carrier").optional().isBoolean().withMessage("Indica si es transportista").toBoolean(),
  optionalText("mtc_registration", 30, "El registro MTC"),
];

export const createSupplierValidator = [
  body("company_id").optional({ values: "null" }).isInt({ min: 1 }).withMessage("La empresa no es válida"),
  ...supplierBody,
];

export const updateSupplierValidator = [idParam, ...supplierBody];

export const disableSupplierValidator = [idParam];

export const listSuppliersValidator = [
  query("searchTerm").optional().isString().isLength({ max: 100 }),
  query("status").optional().isIn(["active", "inactive", "active,inactive", "inactive,active"]),
  query("companyId").optional({ values: "falsy" }).isInt({ min: 1 }),
];
