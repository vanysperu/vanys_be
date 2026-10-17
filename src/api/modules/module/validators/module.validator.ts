import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

export const createModuleValidator = [
  body("code")
    .not()
    .isEmpty()
    .withMessage("El código es obligatorio")
    .bail()
    .isString()
    .withMessage("El código debe ser una cadena de texto")
    .bail()
    .matches(/^[a-z0-9_]+$/)
    .withMessage("El código solo puede tener minúsculas, números y guion bajo")
    .bail(),
  body("name")
    .not()
    .isEmpty()
    .withMessage("El nombre es obligatorio")
    .bail()
    .isString()
    .withMessage("El nombre debe ser una cadena de texto")
    .bail(),
  body("description").optional({ values: "null" }).isString().withMessage("La descripción debe ser una cadena de texto"),
  body("icon").optional({ values: "null" }).isString().withMessage("El ícono debe ser una cadena de texto"),
  body("position").optional().isInt().withMessage("La posición debe ser un número entero"),
];

const paramModuleIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id del módulo es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id del módulo debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const module = await DataBase.instance.module.findOne({ where: { id: Number(value) } });
    if (!module) throw new Error("El módulo con el ID proporcionado no existe.");
    return true;
  })
  .bail();

export const updateModuleValidator = [
  paramModuleIdValidator,
  body("code")
    .optional()
    .isString()
    .withMessage("El código debe ser una cadena de texto")
    .bail()
    .matches(/^[a-z0-9_]+$/)
    .withMessage("El código solo puede tener minúsculas, números y guion bajo"),
  body("name").optional().isString().withMessage("El nombre debe ser una cadena de texto"),
  body("description").optional({ values: "null" }).isString().withMessage("La descripción debe ser una cadena de texto"),
  body("icon").optional({ values: "null" }).isString().withMessage("El ícono debe ser una cadena de texto"),
  body("position").optional().isInt().withMessage("La posición debe ser un número entero"),
];

export const disableModuleValidator = [paramModuleIdValidator];
