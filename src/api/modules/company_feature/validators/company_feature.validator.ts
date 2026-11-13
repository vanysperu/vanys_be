import { body, param } from "express-validator";

const companyIdParam = param("companyId").isInt({ min: 1 }).withMessage("La empresa no es válida").toInt();

export const getCompanyFeaturesValidator = [companyIdParam];

// { features: { supplier_stock: true } }
export const setCompanyFeaturesValidator = [
  companyIdParam,
  body("features").isObject().withMessage("Indica qué funcionalidades prender o apagar"),
  body("features.*").isBoolean({ strict: true }).withMessage("Cada funcionalidad va con true (prendida) o false (apagada)"),
];
