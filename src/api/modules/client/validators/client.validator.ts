import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

// Mismas reglas que el frontend (grulla_fe: client.schema.ts) — nunca se
// confía solo en la validación del cliente (CLAUDE.md sección 12).
const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'.-]+$/;
const PHONE_REGEX = /^\d{6,9}$/;

export const createClientValidator = [
  body("company_id")
    .not()
    .isEmpty()
    .withMessage("La empresa es obligatoria")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("La empresa debe ser un id válido"),
  body("business_unit_id").optional({ values: "null" }).isInt({ gt: 0 }),
  body("name")
    .not()
    .isEmpty()
    .withMessage("El nombre es obligatorio")
    .bail()
    .isString()
    .matches(NAME_REGEX)
    .withMessage("El nombre solo puede tener letras"),
  body("document_number").optional({ values: "null" }).isString().isLength({ max: 20 }).withMessage("Máximo 20 caracteres"),
  body("email").optional({ values: "falsy" }).isEmail().withMessage("El email debe ser válido"),
  body("phone")
    .optional({ values: "falsy" })
    .matches(PHONE_REGEX)
    .withMessage("El teléfono debe tener entre 6 y 9 dígitos, solo números"),
  body("address").optional({ values: "null" }).isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
];

const paramClientIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id del cliente es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id del cliente debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const client = await DataBase.instance.client.findOne({ where: { id: Number(value) } });
    if (!client) throw new Error("El cliente con el ID proporcionado no existe.");
    return true;
  })
  .bail();

export const updateClientValidator = [
  paramClientIdValidator,
  body("name").optional().isString().matches(NAME_REGEX).withMessage("El nombre solo puede tener letras"),
  body("document_number").optional({ values: "null" }).isString().isLength({ max: 20 }).withMessage("Máximo 20 caracteres"),
  body("email").optional({ values: "falsy" }).isEmail().withMessage("El email debe ser válido"),
  body("phone")
    .optional({ values: "falsy" })
    .matches(PHONE_REGEX)
    .withMessage("El teléfono debe tener entre 6 y 9 dígitos, solo números"),
  body("address").optional({ values: "null" }).isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
];

export const disableClientValidator = [paramClientIdValidator];
