import { body } from "express-validator";
import { allValidator } from "../../../../middlewares/error-validator";

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

const recoveryCodeValidator = body("verificationCode")
  .not()
  .isEmpty()
  .withMessage("El código de verificación es obligatorio")
  .bail()
  .isString()
  .withMessage("El código de verificación debe ser una cadena de texto")
  .bail()
  .isLength({ min: 4, max: 4 })
  .withMessage("El código de verificación debe ser de 4 dígitos")
  .bail();

const passwordValidator = body("password")
  .not()
  .isEmpty()
  .withMessage("La contraseña no puede estar vacía")
  .bail()
  .isString()
  .withMessage("Se requiere una cadena de texto para la contraseña")
  .bail();

export const signInValidator = [emailValidator, passwordValidator];

export const sendCodeForRecoveryValidator = [emailValidator];

export const verifyRecoveryCodeValidator = [
  emailValidator,
  recoveryCodeValidator,
];

export const recoveryUserAccountValidator = [
  emailValidator,
  passwordValidator,
  recoveryCodeValidator,
];
