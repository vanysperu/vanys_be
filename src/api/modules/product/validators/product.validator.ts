import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

// SKU: código alfanumérico (con guion/guion bajo) — no es un nombre propio,
// pero tampoco debe llevar espacios ni símbolos raros. Columna STRING(50).
const SKU_REGEX = /^[A-Za-z0-9_-]+$/;

// Al menos uno de los 4 precios de catálogo debe estar cargado — si no,
// el producto no se podría cotizar en ninguna modalidad de catálogo (solo
// quedaría "personalizado", que no tiene sentido como único modo).
const atLeastOnePriceValidator = body().custom((_, { req }) => {
  const { price_unit, price_hundred, price_half_thousand, price_thousand } = req.body;
  if (
    [price_unit, price_hundred, price_half_thousand, price_thousand].some(
      (value) => value !== undefined && value !== null
    )
  ) {
    return true;
  }
  throw new Error("Debes cargar al menos un precio (por unidad, por ciento, medio millar o por millar)");
});

export const createProductValidator = [
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
  body("sku")
    // Vacío = sin SKU (el formulario manda "" si no se escribe nada).
    .optional({ values: "falsy" })
    .isString()
    .isLength({ max: 50 })
    .withMessage("Máximo 50 caracteres")
    .bail()
    .matches(SKU_REGEX)
    .withMessage("El SKU solo puede tener letras, números, guiones y guion bajo"),
  body("price_unit").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }).withMessage("El precio por unidad debe ser un número positivo"),
  body("price_hundred").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }).withMessage("El precio por ciento debe ser un número positivo"),
  body("price_half_thousand").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }).withMessage("El precio por medio millar debe ser un número positivo"),
  body("price_thousand").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }).withMessage("El precio por millar debe ser un número positivo"),
  body("requires_customization").optional().isBoolean().withMessage("\"Requiere personalización\" debe ser verdadero o falso"),
  atLeastOnePriceValidator,
];

const paramProductIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id del producto es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id del producto debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const product = await DataBase.instance.product.findOne({ where: { id: Number(value) } });
    if (!product) throw new Error("El producto con el ID proporcionado no existe.");
    return true;
  })
  .bail();

export const updateProductValidator = [
  paramProductIdValidator,
  body("name").optional().isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
  body("description").optional({ values: "null" }).isString(),
  body("sku")
    // Vacío = sin SKU (el formulario manda "" si no se escribe nada).
    .optional({ values: "falsy" })
    .isString()
    .isLength({ max: 50 })
    .withMessage("Máximo 50 caracteres")
    .bail()
    .matches(SKU_REGEX)
    .withMessage("El SKU solo puede tener letras, números, guiones y guion bajo"),
  body("price_unit").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_hundred").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_half_thousand").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("price_thousand").optional({ values: "null" }).isFloat({ min: 0, max: 99999999.99 }),
  body("requires_customization").optional().isBoolean().withMessage("\"Requiere personalización\" debe ser verdadero o falso"),
];

export const disableProductValidator = [paramProductIdValidator];
