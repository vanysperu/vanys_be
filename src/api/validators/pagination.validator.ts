import { query } from "express-validator";
export const paginationValidator = [
  query("page")
    .optional()
    .isInt({ gt: 0 })
    .withMessage("La página debe ser un número entero positivo")
    .bail(),

  query("limit")
    .optional()
    .isInt({ gt: 0 })
    .withMessage("El límite debe ser un número entero positivo")
    .bail(),

  query("pageSize")
    .optional()
    .isInt({ gt: 0 })
    .withMessage("El límite debe ser un número entero positivo")
    .bail(),
  query("startDate")
    .optional()
    .isISO8601({ strict: true, strictSeparator: true }) // ✅ Acepta ISO completo
    .withMessage("La fecha de inicio debe estar en formato válido (YYYY-MM-DDTHH:mm:ss)")
    .custom((startDate, { req }) => {
      const { endDate } = req.query as Record<string, string | undefined>;

      if (endDate && new Date(startDate) > new Date(endDate)) {
        throw new Error("La fecha de inicio no puede ser mayor que la fecha de fin");
      }
      return true;
    }),

  query("endDate")
    .optional()
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage("La fecha de fin debe estar en formato válido (YYYY-MM-DDTHH:mm:ss)")
    .custom((endDate, { req }) => {
      const { startDate } = req.query as Record<string, string | undefined>;

      if (startDate && new Date(endDate) < new Date(startDate)) {
        throw new Error("La fecha de fin no puede ser menor que la fecha de inicio");
      }
      return true;
    }),

  query("order")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("El orden debe ser 'asc' o 'desc'")
    .bail(),

  query("sort")
    .optional()
    .isString()
    .withMessage("El campo de ordenamiento debe ser una cadena de texto")
    .bail(),
];
