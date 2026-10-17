import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

// Nombre de rol: letras/acentos/números/espacios/guion (ej. "Administrador",
// "Gestor L2") — es un nombre libre pero no debe llevar símbolos raros.
const ROLE_NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9\s'.-]+$/;

export const createRoleDtoValidator = [
  body("name")
    .not()
    .isEmpty()
    .withMessage("El nombre no puede estar vacío")
    .bail()
    .isString()
    .withMessage("El nombre debe ser una cadena de texto")
    .bail()
    .isLength({ min: 3, max: 255 })
    .withMessage("El nombre debe tener como mínimo 3 y como máximo 255 caracteres")
    .bail()
    .matches(ROLE_NAME_REGEX)
    .withMessage("El nombre solo puede tener letras, números, espacios y guiones")
    .bail(),
  body("description")
    .optional({ values: "null" })
    .isString()
    .withMessage("La descripción debe ser una cadena de texto")
    .bail(),
];

const paramRoleIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id del rol es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id del rol debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const roleId = Number(value);
    const role = await DataBase.instance.role.findOne({
      where: { id: roleId },
    });
    if (!role) {
      throw new Error("El rol con el ID proporcionado no existe.");
    }
    return true;
  })
  .bail();

export const updateRoleDtoValidator = [
  paramRoleIdValidator,
  body("name")
    .optional({ values: "null" })
    .not()
    .isEmpty()
    .withMessage("El nombre no puede estar vacío")
    .bail()
    .isString()
    .withMessage("El nombre debe ser una cadena de texto")
    .bail()
    .isLength({ min: 3, max: 255 })
    .withMessage("El nombre debe tener como mínimo 3 y como máximo 255 caracteres")
    .bail()
    .matches(ROLE_NAME_REGEX)
    .withMessage("El nombre solo puede tener letras, números, espacios y guiones")
    .bail(),
  body("description")
    .optional({ values: "null" })
    .isString()
    .withMessage("La descripción debe ser una cadena de texto")
    .bail(),
];

export const disableRoleValidator = [ paramRoleIdValidator ]
