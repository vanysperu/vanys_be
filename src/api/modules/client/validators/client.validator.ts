import { body, param, CustomValidator } from "express-validator";
import { DataBase } from "../../../../database";

// Mismas reglas que el frontend (grulla_fe: client.schema.ts) — nunca se
// confía solo en la validación del cliente (CLAUDE.md sección 12).
const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'.-]+$/;
const PHONE_REGEX = /^\d{6,9}$/;

// El sistema permitía registrar dos o más clientes con el mismo email o
// documento dentro de la misma empresa (bug reportado por QA). La
// unicidad se valida por empresa (no global): dos empresas distintas sí
// pueden tener cada una un cliente con el mismo correo/documento. Al crear,
// la empresa viene de `req.body.company_id`; al editar, el body no manda
// `company_id` (ver client.controller.ts), así que se resuelve desde el
// cliente objetivo (`req.params.id`), y se excluye al propio cliente de la
// comparación.
const assertUniqueClientField =
  (field: "email" | "document_number", label: string): CustomValidator =>
  async (value, { req }) => {
    // "" (campo vacío enviado por el form, no omitido) nunca debe
    // considerarse un valor real a deduplicar — si no, dos clientes sin
    // documento/email cargado (ambos "") chocaban entre sí con "ya existe un
    // cliente con este..." (bug real detectado al correr el e2e de QA: el
    // campo Documento vacío igual disparaba el error de duplicado).
    // `document_number` usa `.optional({values:"null"})` (no "falsy") porque
    // el formato sí debe seguir validándose para cualquier valor no-null, así
    // que el filtro de "vacío" para la unicidad se hace acá, no en la cadena.
    if (!value) return true;

    const targetId = req.params?.id ? Number(req.params.id) : null;
    const companyId = req.body.company_id
      ? Number(req.body.company_id)
      : targetId
        ? (await DataBase.instance.client.findByPk(targetId))?.company_id
        : undefined;

    if (!companyId) return true;

    const existing = await DataBase.instance.client.findOne({
      where: { [field]: value, company_id: companyId, is_deleted: false },
    });
    if (existing && existing.id !== targetId) {
      throw new Error(`Ya existe un cliente con este ${label} en la empresa.`);
    }
    return true;
  };

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
  body("document_number")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 20 })
    .withMessage("Máximo 20 caracteres")
    .bail()
    .custom(assertUniqueClientField("document_number", "número de documento"))
    .bail(),
  body("email")
    .optional({ values: "falsy" })
    .isEmail()
    .withMessage("El email debe ser válido")
    .bail()
    .custom(assertUniqueClientField("email", "email"))
    .bail(),
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
  body("document_number")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 20 })
    .withMessage("Máximo 20 caracteres")
    .bail()
    .custom(assertUniqueClientField("document_number", "número de documento"))
    .bail(),
  body("email")
    .optional({ values: "falsy" })
    .isEmail()
    .withMessage("El email debe ser válido")
    .bail()
    .custom(assertUniqueClientField("email", "email"))
    .bail(),
  body("phone")
    .optional({ values: "falsy" })
    .matches(PHONE_REGEX)
    .withMessage("El teléfono debe tener entre 6 y 9 dígitos, solo números"),
  body("address").optional({ values: "null" }).isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
];

export const disableClientValidator = [paramClientIdValidator];
