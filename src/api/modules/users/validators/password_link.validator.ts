import { body, param } from "express-validator";
import { PASSWORD_LINK_PURPOSES } from "../../auth/model/password_reset_token.model";

// POST /user/:id/password-link
export const sendPasswordLinkValidator = [
  param("id").isInt({ min: 1 }).withMessage("El id debe ser un número entero mayor a cero").toInt(),
  body("purpose")
    .isIn([...PASSWORD_LINK_PURPOSES])
    .withMessage("El tipo de enlace debe ser 'invite' (invitación) o 'reset' (restablecer)"),
];
