import { body, param, query } from "express-validator";

const TITLE_MAX = 120;
const LINK_MAX = 500;
const IMAGE_PATH_MAX = 255;

export const advertisementIdValidator = [param("id").isInt({ gt: 0 }).withMessage("El anuncio no es válido").toInt()];

const titleRule = () =>
  body("title")
    .isString()
    .withMessage("El título es obligatorio")
    .bail()
    .trim()
    .isLength({ min: 1, max: TITLE_MAX })
    .withMessage(`El título tiene de 1 a ${TITLE_MAX} caracteres`);

// Enlace al hacer clic en la web: opcional ("" o null lo quita). Solo http o
// https: la web lo pone en un href y un "javascript:..." sería un riesgo.
const linkRule = () =>
  body("link_url")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: LINK_MAX })
    .withMessage(`El enlace tiene máximo ${LINK_MAX} caracteres`)
    .bail()
    .isURL({ protocols: ["http", "https"], require_protocol: true })
    .withMessage("El enlace debe ser una dirección web que empiece con http:// o https://");

const imagePathRule = () =>
  body("image_path")
    .isString()
    .withMessage("Sube la imagen del anuncio")
    .bail()
    .isLength({ min: 1, max: IMAGE_PATH_MAX })
    .withMessage("Sube la imagen del anuncio");

// Zona (Variables Generales "advertisement_zone"): opcional; null = sin zona.
const zoneRule = () =>
  body("zone_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La zona no es válida").toInt();

const positionRule = () => body("position").isInt({ min: 1, max: 100000 }).withMessage("La posición empieza en 1").toInt();

export const listAdvertisementsValidator = [
  query("companyId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("La empresa no es válida"),
  // Una zona (id) o "none" para los anuncios sin zona.
  query("zoneId")
    .optional({ values: "falsy" })
    .custom((value) => value === "none" || Number(value) > 0)
    .withMessage("La zona no es válida"),
  query("status").optional({ values: "falsy" }).isIn(["active", "inactive", "all"]).withMessage("El estado no es válido"),
  query("title").optional({ values: "falsy" }).isString().isLength({ max: TITLE_MAX }),
];

export const createAdvertisementValidator = [
  // Solo la usa el Super Administrador: a un usuario de empresa se le asigna la suya.
  body("company_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La empresa no es válida"),
  zoneRule(),
  titleRule(),
  linkRule(),
  imagePathRule(),
  body("is_active").optional().isBoolean().withMessage("is_active debe ser true o false").toBoolean(),
];

export const updateAdvertisementValidator = [
  ...advertisementIdValidator,
  zoneRule(),
  titleRule().optional(),
  linkRule(),
  imagePathRule().optional(),
  positionRule().optional(),
];

export const moveAdvertisementValidator = [...advertisementIdValidator, positionRule()];

// GET /public/advertisements: la zona por su código (zone) o por su id (zone_id).
export const listPublicAdvertisementsValidator = [
  query("zone").optional({ values: "falsy" }).isString().trim().isLength({ max: 255 }).withMessage("La zona no es válida"),
  query("zone_id").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("zone_id debe ser un id válido"),
];

export const disableAdvertisementValidator = [
  ...advertisementIdValidator,
  body("is_active")
    .isBoolean()
    .withMessage("Indica si el anuncio queda prendido (true) o apagado (false)")
    .toBoolean(),
];
