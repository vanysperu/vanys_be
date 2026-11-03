import { body, param, query } from "express-validator";

const nameRule = (optional: boolean) => {
  const chain = body("name");
  return (optional ? chain.optional() : chain)
    .isString()
    .withMessage("El nombre es obligatorio")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("El nombre es obligatorio")
    .isLength({ max: 100 })
    .withMessage("Máximo 100 caracteres");
};

const businessUnitRule = body("business_unit_id")
  .optional({ values: "null" })
  .isInt({ gt: 0 })
  .withMessage("La tienda no es válida")
  .toInt();

const idParamRule = param("id").isInt({ gt: 0 }).withMessage("El id de la API key no es válido").toInt();

export const listApiKeysValidator = [
  query("companyId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("La empresa no es válida"),
  query("status").optional({ values: "falsy" }).isIn(["active", "revoked", "all"]).withMessage("Estado inválido"),
  query("name").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
];

export const createApiKeyValidator = [
  body("company_id").isInt({ gt: 0 }).withMessage("La empresa es obligatoria").toInt(),
  businessUnitRule,
  nameRule(false),
];

// La empresa no se cambia: una key de otra empresa es otra key (se revoca y
// se crea una nueva).
export const updateApiKeyValidator = [idParamRule, businessUnitRule, nameRule(true)];

export const apiKeyIdValidator = [idParamRule];
