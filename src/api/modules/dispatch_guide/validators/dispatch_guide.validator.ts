import { body, param, query } from "express-validator";
import { GUIDE_STATUSES } from "../model/dispatch_guide.models";
import { GUIDE_REASON_CODES, IDENTITY_DOC_TYPES, RELATED_DOC_TYPES } from "../types/dispatch_guide.types";

const MAX_LINES = 200;
const idParam = param("id").isInt({ min: 1 }).withMessage("El id no es válido").toInt();
const companyQuery = query("companyId").optional({ values: "falsy" }).isInt({ min: 1 });
const optionalId = (field: string, label: string) => body(field).optional({ values: "null" }).isInt({ min: 1 }).withMessage(`${label} no es válido`).toInt();
const optionalText = (field: string, max: number) => body(field).optional({ values: "null" }).isString().isLength({ max }).withMessage(`Máximo ${max} caracteres`);
const optionalDate = (field: string, label: string) =>
  body(field).optional({ values: "falsy" }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage(`${label}: la fecha va como AAAA-MM-DD`);
const optionalUbigeo = (field: string) => body(field).optional({ values: "falsy" }).matches(/^\d{6}$/).withMessage("El ubigeo tiene 6 dígitos");
const optionalEstablishment = (field: string) =>
  body(field).optional({ values: "falsy" }).matches(/^\d{4}$/).withMessage("El código de establecimiento SUNAT tiene 4 dígitos");

export const idValidator = [idParam];

// ------------------------------------------------------------- catálogos
export const catalogListValidator = [
  companyQuery,
  query("searchTerm").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
  query("status").optional({ values: "falsy" }).isIn(["active", "inactive"]),
];

export const vehicleValidator = [
  body("company_id").optional({ values: "null" }).isInt({ min: 1 }),
  body("plate")
    .isString()
    .trim()
    .custom((value: string) => /^[A-Za-z0-9]{5,8}$/.test(value.replace(/[^A-Za-z0-9]/g, "")))
    .withMessage("La placa tiene de 5 a 8 letras o números (ej. ABC-123)"),
  optionalText("description", 120),
  optionalText("authorization_number", 30),
];
export const updateVehicleValidator = [idParam, ...vehicleValidator];

export const driverValidator = [
  body("company_id").optional({ values: "null" }).isInt({ min: 1 }),
  body("doc_type").isIn(Object.keys(IDENTITY_DOC_TYPES)).withMessage("Elige el tipo de documento"),
  body("doc_number").isString().trim().matches(/^[A-Za-z0-9]{6,15}$/).withMessage("El número de documento no es válido"),
  body("first_names").isString().trim().isLength({ min: 1, max: 100 }).withMessage("Los nombres son obligatorios"),
  body("last_names").isString().trim().isLength({ min: 1, max: 100 }).withMessage("Los apellidos son obligatorios"),
  body("license_number").isString().trim().matches(/^[A-Za-z0-9-]{5,20}$/).withMessage("El número de licencia no es válido"),
];
export const updateDriverValidator = [idParam, ...driverValidator];

export const carriersValidator = [companyQuery, query("searchTerm").optional({ values: "falsy" }).isString().isLength({ max: 100 })];

// ---------------------------------------------------------------- guías
export const listGuidesValidator = [
  companyQuery,
  query("searchTerm").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
  query("status")
    .optional({ values: "falsy" })
    .custom((value: string) => String(value).split(",").every((status) => (GUIDE_STATUSES as readonly string[]).includes(status)))
    .withMessage("Estado no válido"),
  query("quotationId").optional({ values: "falsy" }).isInt({ min: 1 }),
  query("dateFrom").optional({ values: "falsy" }).isISO8601(),
  query("dateTo").optional({ values: "falsy" }).isISO8601(),
];

export const prefillValidator = [
  query("quotationId").optional({ values: "falsy" }).isInt({ min: 1 }).toInt(),
  query("transferId").optional({ values: "falsy" }).isInt({ min: 1 }).toInt(),
];

// Borrador: lo obligatorio para SUNAT se revisa al registrar la guía emitida.
export const guideValidator = [
  body("company_id").optional({ values: "null" }).isInt({ min: 1 }),
  optionalId("business_unit_id", "La tienda"),
  optionalId("quotation_id", "La cotización"),
  optionalId("stock_document_id", "La transferencia"),
  body("reason_code").isIn(GUIDE_REASON_CODES).withMessage("Elige el motivo del traslado"),
  optionalText("reason_note", 255),
  optionalDate("transfer_start_date", "Inicio del traslado"),
  body("transport_mode").isIn(["public", "private"]).withMessage("Elige la modalidad de transporte"),
  body("light_vehicle").optional().isBoolean().toBoolean(),
  body("gross_weight_kg").optional({ values: "null" }).isFloat({ gt: 0, max: 9999999 }).withMessage("El peso bruto debe ser mayor a 0").toFloat(),
  body("packages").optional({ values: "null" }).isInt({ min: 1, max: 99999 }).withMessage("Los bultos van de 1 a 99999").toInt(),
  optionalId("origin_warehouse_id", "El almacén de partida"),
  optionalText("origin_address", 255),
  optionalUbigeo("origin_ubigeo"),
  optionalEstablishment("origin_establishment_code"),
  optionalId("destination_warehouse_id", "El almacén de llegada"),
  optionalText("destination_address", 255),
  optionalUbigeo("destination_ubigeo"),
  optionalEstablishment("destination_establishment_code"),
  optionalId("client_id", "El cliente"),
  body("recipient_doc_type").optional({ values: "falsy" }).isIn(Object.keys(IDENTITY_DOC_TYPES)).withMessage("Tipo de documento no válido"),
  body("recipient_doc_number").optional({ values: "falsy" }).isString().matches(/^[A-Za-z0-9]{6,15}$/).withMessage("Documento del destinatario no válido"),
  optionalText("recipient_name", 200),
  optionalId("carrier_supplier_id", "El transportista"),
  body("vehicle_ids").optional().isArray({ max: 3 }).withMessage("Máximo 3 vehículos"),
  body("vehicle_ids.*").isInt({ min: 1 }).toInt(),
  body("driver_ids").optional().isArray({ max: 3 }).withMessage("Máximo 3 conductores"),
  body("driver_ids.*").isInt({ min: 1 }).toInt(),
  optionalText("notes", 500),
  body("lines").isArray({ min: 1, max: MAX_LINES }).withMessage(`La guía lleva entre 1 y ${MAX_LINES} bienes`),
  body("lines.*.product_id").optional({ values: "null" }).isInt({ min: 1 }).toInt(),
  body("lines.*.quotation_item_id").optional({ values: "null" }).isInt({ min: 1 }).toInt(),
  body("lines.*.product_code").optional({ values: "null" }).isString().isLength({ max: 60 }),
  body("lines.*.description").isString().trim().isLength({ min: 1, max: 500 }).withMessage("Cada bien necesita una descripción"),
  body("lines.*.color").optional({ values: "null" }).isString().isLength({ max: 60 }),
  body("lines.*.quantity").isFloat({ gt: 0, max: 9999999 }).withMessage("La cantidad debe ser mayor a 0").toFloat(),
  body("lines.*.unit_code").optional({ values: "falsy" }).isString().matches(/^[A-Za-z0-9]{1,5}$/).withMessage("Unidad no válida"),
  body("related_documents").optional().isArray({ max: 10 }),
  body("related_documents.*.doc_type").isIn(Object.keys(RELATED_DOC_TYPES)).withMessage("Tipo de documento relacionado no válido"),
  body("related_documents.*.series_number")
    .isString()
    .trim()
    .matches(/^[A-Za-z0-9]{1,4}-\d{1,10}$/)
    .withMessage("El documento relacionado va como serie-número (ej. F001-123)"),
  body("related_documents.*.issuer_ruc").optional({ values: "falsy" }).matches(/^\d{11}$/).withMessage("El RUC tiene 11 dígitos"),
];
export const updateGuideValidator = [idParam, ...guideValidator];

// Registrar la guía emitida en SUNAT (multipart: el PDF es opcional).
export const registerGuideValidator = [
  idParam,
  body("series").isString().trim().matches(/^[Tt][A-Za-z0-9]{3}$/).withMessage("La serie es T y 3 caracteres (ej. T001)"),
  body("number").isInt({ min: 1, max: 99999999 }).withMessage("El número de la guía no es válido").toInt(),
  optionalDate("issue_date", "Fecha de emisión"),
];

export const voidGuideValidator = [
  idParam,
  body("reason").isString().trim().isLength({ min: 5, max: 255 }).withMessage("Escribe el motivo de la anulación (5 a 255 caracteres)"),
];
