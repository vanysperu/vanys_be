import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

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
  body("extra_type").isIn(["fixed", "percentage"]).withMessage("El tipo de costo debe ser fijo o porcentual"),
  // "percentage" exige extra_value (es el único dato que usa ese modo);
  // "fixed" exige al menos uno de los 4 precios por volumen (igual que
  // "product" — CLAUDE.md sección 12, mismo criterio de validación laxo:
  // no hace falta cargar los 4, con uno alcanza).
  body("extra_value")
    .if(body("extra_type").equals("percentage"))
    .not()
    .isEmpty()
    .withMessage("El costo adicional es obligatorio")
    .bail()
    .isFloat({ min: 0, max: 99999999.99 })
    .withMessage("El costo adicional debe ser un número positivo"),
  body("extra_value").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_unit").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_hundred").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_half_thousand").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_thousand").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body().custom((_, { req }) => {
    const { extra_type, price_unit, price_hundred, price_half_thousand, price_thousand } = req.body;
    if (extra_type !== "fixed") return true;
    const hasAnyTierPrice = [price_unit, price_hundred, price_half_thousand, price_thousand].some(
      (value) => value !== undefined && value !== null
    );
    if (!hasAnyTierPrice) {
      throw new Error("Carga al menos un precio (por unidad, por ciento, medio millar o por millar)");
    }
    return true;
  }),
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
  body("extra_type").optional().isIn(["fixed", "percentage"]),
  body("extra_value").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_unit").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_hundred").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_half_thousand").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_thousand").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
];

export const disableTechniqueValidator = [paramTechniqueIdValidator];
