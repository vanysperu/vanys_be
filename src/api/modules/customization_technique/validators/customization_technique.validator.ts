import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

// Mismo criterio que productos (product.validator.ts): la técnica tiene 4
// precios por volumen y al menos uno debe estar cargado — si no, no se
// podría cotizar en ninguna modalidad.
const atLeastOnePriceValidator = body().custom((_, { req }) => {
  const { price_unit, price_hundred, price_half_thousand, price_thousand } = req.body;
  const hasAnyTierPrice = [price_unit, price_hundred, price_half_thousand, price_thousand].some(
    (value) => value !== undefined && value !== null && value !== ""
  );
  if (!hasAnyTierPrice) {
    throw new Error("Carga al menos un precio (por unidad, por ciento, medio millar o por millar)");
  }
  return true;
});

const tierPriceValidators = [
  body("price_unit").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }).withMessage("El precio por unidad debe ser un número positivo"),
  body("price_hundred").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }).withMessage("El precio por ciento debe ser un número positivo"),
  body("price_half_thousand").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }).withMessage("El precio por medio millar debe ser un número positivo"),
  body("price_thousand").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }).withMessage("El precio por millar debe ser un número positivo"),
];

export const createTechniqueValidator = [
  body("company_id")
    .not()
    .isEmpty()
    .withMessage("La empresa es obligatoria")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("La empresa debe ser un id válido"),
  body("name")
    .not()
    .isEmpty()
    .withMessage("El nombre es obligatorio")
    .bail()
    .isString()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("description").optional({ values: "null" }).isString(),
  ...tierPriceValidators,
  atLeastOnePriceValidator,
];

const paramTechniqueIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id de la técnica es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id de la técnica debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const technique = await DataBase.instance.customization_technique.findOne({ where: { id: Number(value) } });
    if (!technique) throw new Error("La técnica con el ID proporcionado no existe.");
    return true;
  })
  .bail();

export const updateTechniqueValidator = [
  paramTechniqueIdValidator,
  body("name").optional().isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
  body("description").optional({ values: "null" }).isString(),
  ...tierPriceValidators,
];

export const disableTechniqueValidator = [paramTechniqueIdValidator];
