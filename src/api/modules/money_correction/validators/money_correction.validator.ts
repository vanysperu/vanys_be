import { body, param, ValidationChain } from "express-validator";
import { paginationValidator } from "../../../validators/pagination.validator";

// Motivo obligatorio de TODA corrección de dinero (5 a 500 caracteres, igual
// que el CHECK de money_correction): una corrección sin explicación no se
// puede auditar.
export const correctionReasonRule = (field = "reason"): ValidationChain =>
  body(field)
    .isString()
    .withMessage("Indica el motivo de la corrección")
    .bail()
    .trim()
    // Se cuentan caracteres reales ([...texto]), no unidades UTF-16: un emoji
    // vale 1 como en CHAR_LENGTH de la base, no 2.
    .custom((value: string) => [...value].length >= 5 && [...value].length <= 500)
    .withMessage("El motivo de la corrección debe tener entre 5 y 500 caracteres");

// Solo la FORMA del id: la existencia y el alcance (empresa/tienda) los
// resuelve el service, y un id ajeno responde 404 igual que uno que no
// existe (no se confirma que exista en otra empresa).
export const correctionIdParamRule = (paramName = "id"): ValidationChain =>
  param(paramName).isInt({ gt: 0 }).withMessage("El id debe ser un número entero positivo");

// GET /<recurso>/:id/corrections?page=&limit=
export const correctionHistoryValidator = [correctionIdParamRule("id"), ...paginationValidator];
