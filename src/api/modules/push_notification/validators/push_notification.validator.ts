import { body } from "express-validator";

// La dirección del servicio de push siempre es https (Apple, Google, Mozilla...).
const endpointRule = body("endpoint")
  .isString()
  .isLength({ min: 10, max: 700 })
  .withMessage("La suscripción no es válida")
  .bail()
  .isURL({ protocols: ["https"], require_protocol: true, require_tld: false })
  .withMessage("La suscripción no es válida");

export const subscribeValidator = [
  endpointRule,
  body("keys.p256dh").isString().isLength({ min: 20, max: 255 }).withMessage("La suscripción no es válida"),
  body("keys.auth").isString().isLength({ min: 8, max: 255 }).withMessage("La suscripción no es válida"),
];

export const unsubscribeValidator = [endpointRule];
