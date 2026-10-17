import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

// Regla por tipo: 'view' exige route y prohíbe verb; 'endpoint' exige route+verb;
// 'button' admite route+verb opcionales (juntos o ninguno).
const routeVerbByType = body().custom((_, { req }) => {
  const { type, route, verb } = req.body;

  if (type === "view") {
    if (!route) throw new Error("Las vistas requieren una ruta (route)");
    if (verb) throw new Error("Las vistas no deben tener verbo (verb)");
  }

  if (type === "endpoint") {
    if (!route || !verb) throw new Error("Los endpoints requieren ruta (route) y verbo (verb)");
  }

  if (type === "button") {
    if ((route && !verb) || (!route && verb)) {
      throw new Error("En un botón, route y verb deben ir juntos o ambos vacíos");
    }
  }

  return true;
});

export const createResourceValidator = [
  body("module_id")
    .not()
    .isEmpty()
    .withMessage("El módulo es obligatorio")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("El módulo debe ser un id válido")
    .bail(),
  body("parent_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("El recurso padre debe ser un id válido"),
  body("type").isIn(["view", "button", "endpoint"]).withMessage("El tipo debe ser view, button o endpoint"),
  body("code").not().isEmpty().withMessage("El código es obligatorio").bail().isString(),
  body("name").not().isEmpty().withMessage("El nombre es obligatorio").bail().isString(),
  body("route").optional({ values: "null" }).isString(),
  body("verb").optional({ values: "null" }).isIn(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  body("position").optional().isInt(),
  routeVerbByType,
];

const paramResourceIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id del recurso es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id del recurso debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const resource = await DataBase.instance.resource.findOne({ where: { id: Number(value) } });
    if (!resource) throw new Error("El recurso con el ID proporcionado no existe.");
    return true;
  })
  .bail();

export const updateResourceValidator = [paramResourceIdValidator];

export const disableResourceValidator = [paramResourceIdValidator];

export const getResourceByIdValidator = [paramResourceIdValidator];
