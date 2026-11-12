import { body } from "express-validator";
import { passwordPolicyError } from "../../../../core/validators/password.policy";

const emailValidator = body("email")
  .not()
  .isEmpty()
  .withMessage("El email no puede ser vacío")
  .bail()
  .isEmail()
  .withMessage("Se requiere un email válido")
  .bail()
  .isString()
  .withMessage("El email debe ser una cadena de texto")
  .bail();

const passwordValidator = body("password")
  .not()
  .isEmpty()
  .withMessage("La contraseña no puede estar vacía")
  .bail()
  .isString()
  .withMessage("Se requiere una cadena de texto para la contraseña")
  .bail();

// Token de un enlace de contraseña: base64url de 32 bytes (43 caracteres). Se
// acepta un rango para no atarse al largo exacto.
const linkTokenValidator = body("token")
  .isString()
  .withMessage("El enlace no es válido")
  .bail()
  .matches(/^[A-Za-z0-9_-]{30,100}$/)
  .withMessage("El enlace no es válido");

// Contraseña nueva: misma política en todas las pantallas (core/validators/password.policy.ts).
const newPasswordValidator = body("password")
  .isString()
  .withMessage("La contraseña es obligatoria")
  .bail()
  .custom((value: string) => {
    const problem = passwordPolicyError(value);
    if (problem) throw new Error(problem);
    return true;
  });

export const signInValidator = [emailValidator, passwordValidator];

export const forgotPasswordValidator = [emailValidator];

export const checkPasswordLinkValidator = [linkTokenValidator];

export const completePasswordLinkValidator = [linkTokenValidator, newPasswordValidator];
