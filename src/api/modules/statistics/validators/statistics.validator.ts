import { query } from "express-validator";
import { daysInRange } from "../services/shared/period";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Tope del rango: 3 años alcanzan para comparar temporadas y mantienen la
// tendencia mensual legible (≈37 meses).
export const MAX_RANGE_DAYS = 3 * 366;

const isRealDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const overviewValidator = [
  query("dateFrom")
    .optional({ values: "falsy" })
    .matches(ISO_DATE)
    .withMessage("La fecha inicial debe tener el formato AAAA-MM-DD")
    .bail()
    .custom(isRealDate)
    .withMessage("La fecha inicial no es válida"),
  query("dateTo")
    .optional({ values: "falsy" })
    .matches(ISO_DATE)
    .withMessage("La fecha final debe tener el formato AAAA-MM-DD")
    .bail()
    .custom(isRealDate)
    .withMessage("La fecha final no es válida"),
  // Las dos fechas van juntas (o ninguna: últimos 30 días), en orden y con un
  // largo razonable.
  query("dateTo").custom((dateTo: string | undefined, { req }) => {
    const dateFrom = req.query?.dateFrom as string | undefined;
    if (!dateFrom && !dateTo) return true;
    if (!dateFrom || !dateTo) throw new Error("Indica la fecha inicial y la final");
    if (dateFrom > dateTo) throw new Error("La fecha inicial no puede ser posterior a la final");
    if (daysInRange(dateFrom, dateTo) > MAX_RANGE_DAYS) throw new Error("El rango máximo es de 3 años");
    return true;
  }),
  query("businessUnitId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("La tienda no es válida"),
  query("companyId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("La empresa no es válida"),
];
