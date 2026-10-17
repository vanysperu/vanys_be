import { body, param } from "express-validator";
import { custom } from "joi";
import moment from "moment";
import { DataBase } from "../../../../database";

// Nombre propio: solo letras/acentos/espacios/guiones — mismo criterio que
// clients (client.validator.ts) para todo campo que sea semánticamente un
// "nombre", nunca un código/número.
const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'.-]+$/;

// DD/MM/YYYY (formato que ya manda el frontend, ver UsersListPage.tsx ->
// toDDMMYYYY) — valida que sea una fecha real (rechaza "31/02/2026") y que
// no sea una fecha futura (pedido explícito del usuario: "fecha futura de
// nacimiento" se estaba aceptando).
const validateDateOfBirth = (value: string): true => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error("La fecha de nacimiento debe tener el formato DD/MM/YYYY.");

  const [, dayStr, monthStr, yearStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  const parsed = new Date(year, month - 1, day);
  const isRealDate = parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
  if (!isRealDate) throw new Error("La fecha de nacimiento no es una fecha válida.");

  if (parsed.getTime() > new Date().getTime()) {
    throw new Error("La fecha de nacimiento no puede ser una fecha futura.");
  }
  return true;
};

const paramUserId = param("id")
  .not()
  .isEmpty()
  .withMessage("El id del usuario es obligatorio")
  .bail()
  .isInt({ min: 1 })
  .withMessage("El id debe ser un número entero mayor a cero")
  .bail()
  .custom(async (value: string) => {
    const userId = Number(value);
    const user = await DataBase.instance.user.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new Error("El usuario con el ID proporcionado no existe.");
    }
    return true;
  })
  .bail();

export const createUserDtoValidator = [
  // Nombre
  body("name")
    .trim()
    .not()
    .isEmpty()
    .withMessage("Por favor, ingresa el nombre del usuario.")
    .bail()
    .isString()
    .withMessage("El nombre debe contener solo letras, sin números ni símbolos.")
    .bail()
    .isLength({ min: 3, max: 255 })
    .withMessage("El nombre debe tener como mínimo 3 caracteres y como máximo 255 caracteres")
    .bail()
    .matches(NAME_REGEX)
    .withMessage("El nombre solo puede tener letras")
    .bail(),

  // Apellido paterno
  body("paternal_lastname")
    .trim()
    .not()
    .isEmpty()
    .withMessage("El apellido paterno es obligatorio.")
    .bail()
    .isString()
    .withMessage("El apellido paterno debe ser una cadena de texto.")
    .bail()
    .isLength({ min: 3, max: 255 })
    .withMessage(
      "El apellido paterno debe tener como mínimo 3 caracteres y como máximo 255 caracteres"
    )
    .bail()
    .matches(NAME_REGEX)
    .withMessage("El apellido paterno solo puede tener letras")
    .bail(),

  // Apellido materno (opcional de verdad: el frontend lo manda como "" si
  // el campo queda en blanco, igual que phone_number/email)
  body("maternal_lastname")
    .optional({ values: "falsy" })
    .trim()
    .isString()
    .withMessage("El apellido materno debe ser una cadena de texto.")
    .bail()
    .isLength({ min: 3, max: 255 })
    .withMessage(
      "El apellido materno debe tener como mínimo 3 caracteres y como máximo 255 caracteres"
    )
    .bail()
    .matches(NAME_REGEX)
    .withMessage("El apellido materno solo puede tener letras")
    .bail(),

  // Tipo de documento
  body("document_type")
    .isNumeric()
    .isIn([1, 2, 3, 6])
    .withMessage("El tipo de documento debe ser DNI, CE, PAS o RUC.")
    .bail()
    .custom((value, { req }) => {
      const documentNumber = req.body.document_number;
      switch (value) {
        case 1:
          if (documentNumber.length !== 8) {
            throw new Error("El DNI debe tener 8 dígitos.");
          }
          break;
        case 3:
          if (documentNumber.length < 9 || documentNumber.length > 12) {
            throw new Error("El CE debe tener entre 9 y 12 dígitos.");
          }
          break;
        case 2:
          if (documentNumber.length < 6 || documentNumber.length > 9) {
            throw new Error("El PAS debe tener entre 6 y 9 dígitos.");
          }
          break;
        case 6:
          if (documentNumber.length !== 11) {
            throw new Error("El RUC debe tener 11 dígitos.");
          }
          break;
        default:
          throw new Error("El tipo de documento no válido.");
      }
      // DNI (1) y RUC (6) son siempre numéricos; CE (3) y PAS (2) pueden
      // traer letras (documentos de extranjería), así que no se restringen.
      if ((value === 1 || value === 6) && !/^\d+$/.test(documentNumber)) {
        throw new Error("El DNI/RUC debe contener solo dígitos.");
      }
      return true;
    })
    .bail(),

  // Número de documento (en la práctica es obligatorio al crear: el
  // validador de document_type de arriba usa documentNumber.length sin
  // chequear que exista, así que dejarlo "optional" solo producía un 500
  // al omitirlo).
  body("document_number")
    .not()
    .isEmpty()
    .withMessage("El número de documento es obligatorio.")
    .bail()
    .isString()
    .withMessage("El número de documento debe ser una cadena de texto.")
    .bail()
    .isLength({ min: 6, max: 12 })
    .withMessage("El número de documento debe tener entre 6 y 12 caracteres.")
    .bail()
    .custom(async (value: string) => {
      const existsDocumentNumber = await DataBase.instance.user.findOne({
        where: { document_number: value },
      });
      if (existsDocumentNumber) {
        throw new Error("El número de documento ya está registrado para otro usuario.");
      }
      return true;
    })
    .bail(),

  // Fecha de nacimiento
  body("date_of_birth")
    .isString()
    .withMessage("La fecha de nacimiento debe tener un formato válido (DD/MM/YYYY).")
    .bail()
    .custom(validateDateOfBirth)
    .bail(),

  // Teléfono (opcional: un string vacío del frontend no debe forzar el regex)
  body("phone_number")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("El número de teléfono debe ser texto.")
    .bail()
    .matches(/^[0-9]{6,9}$/)
    .withMessage("El número de teléfono debe contener solo dígitos (6 a 9 caracteres).")
    .bail(),

  // Dirección
  body("address")
    .optional()
    .isString()
    .withMessage("La dirección debe ser una cadena de texto.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("La dirección no debe superar los 255 caracteres.")
    .bail(),

  // Email
  body("email")
    .not()
    .isEmpty()
    .withMessage("El correo electrónico es obligatorio.")
    .bail()
    .isEmail()
    .withMessage("Por favor, ingresa un correo electrónico válido.")
    .bail()
    .isString()
    .withMessage("El correo electrónico debe ser una cadena de texto.")
    .bail()
    .custom(async (value: string) => {
      const existsEmail = await DataBase.instance.user.findOne({
        where: { email: value },
      });
      if (existsEmail) {
        throw new Error("El correo ingresado ya se encuentra registrado.");
      }
      return true;
    })
    .bail(),

  // Estado
  body("status")
    .not()
    .isEmpty()
    .withMessage("El estado del usuario es obligatorio (activo o inactivo).")
    .bail()
    .isBoolean()
    .withMessage("El estado debe ser verdadero o falso (true/false).")
    .bail(),

  // Género
  body("gender").isIn([4, 5]).withMessage("El género debe ser masculino, femenino ").bail(),
];

export const updateUserDtoValidator = [
  // Nombre
  body("name")
    .optional()
    .trim()
    .not()
    .isEmpty()
    .withMessage("El nombre no puede estar vacío si se envía.")
    .bail()
    .isString()
    .withMessage("El nombre debe contener solo letras, sin números ni símbolos.")
    .bail()
    .isLength({ min: 3, max: 255 })
    .withMessage("El nombre debe tener como mínimo 3 caracteres y como máximo 255 caracteres")
    .bail()
    .matches(NAME_REGEX)
    .withMessage("El nombre solo puede tener letras")
    .bail(),

  // Apellido paterno
  body("paternal_lastname")
    .optional()
    .trim()
    .not()
    .isEmpty()
    .withMessage("El apellido paterno no puede estar vacío si se envía.")
    .bail()
    .isString()
    .withMessage("El apellido paterno debe ser una cadena de texto.")
    .bail()
    .isLength({ min: 3, max: 255 })
    .withMessage(
      "El apellido paterno debe tener como mínimo 3 caracteres y como máximo 255 caracteres"
    )
    .bail()
    .matches(NAME_REGEX)
    .withMessage("El apellido paterno solo puede tener letras")
    .bail(),

  // Apellido materno (opcional de verdad: el frontend lo manda como "" si el
  // campo queda en blanco al editar — EditUserDialog en UsersListPage.tsx —
  // igual que maternal_lastname en createUserDtoValidator/phone_number acá
  // mismo; sin `{values:"falsy"}` un "" vacío no activa el `.optional()` de
  // express-validator y el `.not().isEmpty()` bloqueaba CUALQUIER edición de
  // usuario que dejara este campo vacío).
  body("maternal_lastname")
    .optional({ values: "falsy" })
    .trim()
    .isString()
    .withMessage("El apellido materno debe ser una cadena de texto.")
    .bail()
    .isLength({ min: 3, max: 255 })
    .withMessage(
      "El apellido materno debe tener como mínimo 3 caracteres y como máximo 255 caracteres"
    )
    .bail()
    .matches(NAME_REGEX)
    .withMessage("El apellido materno solo puede tener letras")
    .bail(),

  // Tipo de documento
  body("document_type")
    .optional()
    .isNumeric()
    .isIn([1, 2, 3, 6])
    .withMessage("El tipo de documento debe ser 1 (DNI), 2 (PAS), 3 (CE) o 6 (RUC).")
    .bail()
    .custom((value, { req }) => {
      const documentNumber = req.body.document_number;
      if (!documentNumber) return true;

      switch (value) {
        case 1:
          if (documentNumber.length !== 8) throw new Error("El DNI debe tener 8 dígitos.");
          break;
        case 3:
          if (documentNumber.length < 9 || documentNumber.length > 12)
            throw new Error("El CE debe tener entre 9 y 12 dígitos.");
          break;
        case 2:
          if (documentNumber.length < 6 || documentNumber.length > 9)
            throw new Error("El PAS debe tener entre 6 y 9 dígitos.");
          break;
        case 6:
          if (documentNumber.length !== 11) throw new Error("El RUC debe tener 11 dígitos.");
          break;
        default:
          throw new Error("El tipo de documento no válido.");
      }

      // Mismo criterio que en creación: DNI/RUC son siempre numéricos.
      if ((value === 1 || value === 6) && !/^\d+$/.test(documentNumber)) {
        throw new Error("El DNI/RUC debe contener solo dígitos.");
      }

      return true;
    })
    .bail(),

  // Número de documento
  body("document_number")
    .optional()
    .isString()
    .withMessage("El número de documento debe ser una cadena de texto.")
    .bail()
    .isLength({ min: 6, max: 12 })
    .withMessage("El número de documento debe tener entre 6 y 12 caracteres.")
    .bail()
    .custom(async (value: string, { req }) => {
      const {id:userId} = req.params as {id: string};
      const user = await DataBase.instance.user.findOne({
        where: { document_number: value },
      });

      if (user && user.id !== Number(userId)) {
        throw new Error("El número de documento ya está registrado para otro usuario.");
      }

      return true;
    })
    .bail(),

  // Fecha de nacimiento
  body("date_of_birth")
    .optional()
    .isString()
    .withMessage("La fecha de nacimiento debe tener un formato válido (DD/MM/YYYY).")
    .bail()
    .custom(validateDateOfBirth)
    .bail(),

  // Teléfono (opcional: un string vacío del frontend no debe forzar el regex)
  body("phone_number")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("El número de teléfono debe ser texto.")
    .bail()
    .matches(/^[0-9]{6,9}$/)
    .withMessage("El número de teléfono debe contener solo dígitos (6 a 9 caracteres).")
    .bail(),

  // Dirección
  body("address")
    .optional()
    .isString()
    .withMessage("La dirección debe ser una cadena de texto.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("La dirección no debe superar los 255 caracteres.")
    .bail(),

  // Email
  body("email")
    .optional()
    .isEmail()
    .withMessage("Por favor, ingresa un correo electrónico válido.")
    .bail()
    .isString()
    .withMessage("El correo electrónico debe ser una cadena de texto.")
    .bail()
    .custom(async (value: string, { req }) => {
      const {id:userId} = req.params as {id: string};

      const existsEmail = await DataBase.instance.user.findOne({
        where: { email: value },
      });

      if (existsEmail && existsEmail.id !== Number(userId)) {
        throw new Error("El correo ingresado ya se encuentra registrado en otro usuario.");
      }
      return true;
    })
    .bail(),

  // Estado
  body("status")
    .optional()
    .isBoolean()
    .withMessage("El estado debe ser verdadero o falso (true/false).")
    .bail(),

  // Género
  body("gender")
    .optional()
    .isIn([4, 5])
    .withMessage("El género debe ser 4 (masculino) o 5 (femenino).")
    .bail(),
];

export const changePasswordValidator = [
  body("oldPassword")
    .not()
    .isEmpty()
    .withMessage("La contraseña anterior es requerida")
    .bail()
    .isString()
    .withMessage("La contraseña anterior debe ser una cadena de texto")
    .bail()
    .isLength({ min: 6 })
    .withMessage("La contraseña anterior debe tener como mínino 6 dígitos"),
  body("newPassword")
    .not()
    .isEmpty()
    .withMessage("La nueva contraseña es requerida")
    .bail()
    .isString()
    .withMessage("La nueva contraseña debe ser una cadena de texto")
    .bail()
    // Mismo mínimo que exige la pantalla (ChangePasswordPage): antes el
    // backend aceptaba 6, así que llamando a la API directo se podía dejar
    // una contraseña más corta de lo que el sistema dice exigir.
    .isLength({ min: 8 })
    .withMessage("La nueva contraseña debe tener como mínimo 8 caracteres")
    .bail()
    .custom((value, { req }) => {
      if (value === req.body.oldPassword) {
        throw new Error("La nueva contraseña no puede ser igual a la contraseña anterior");
      }
      return true;
    }),
];

export const IdValidator = [paramUserId];
export const batchDisableUserValidator = [
  body("ids")
    .isArray()
    .withMessage("Debe seleccionar al menos un usuario para deshabilitar")
    .bail()
    .not()
    .isEmpty()
    .withMessage("Debe seleccionar al menos un usuario para deshabilitar")
    .bail()
    .custom((value: unknown[]) => {
      if (!value.every((entry) => Number.isInteger(entry))) {
        throw new Error("Todos los elementos deben ser enteros");
      }
      if (new Set(value).size !== value.length) {
        throw new Error("Todos los números deben ser únicos");
      }
      return true;
    }),
];
