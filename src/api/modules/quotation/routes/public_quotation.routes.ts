import { Router } from "express";
import { allValidator } from "../../../../middlewares/error-validator";
import { rateLimit } from "../../../../core/middlewares/rateLimit";
import { publicQuotationPdfController, publicQuotationViewController } from "../controllers/share/share.controllers";
import { publicQuotationValidator } from "../validators/share.validator";

// Cotización compartida con el cliente (Sprint 2, ítem 7): PÚBLICA por diseño
// (pedido del usuario: "debe poder verse sin logeo"), sin sesión ni API key.
// Se monta en /api/public/q. La protegen el código aleatorio de 22 caracteres,
// el interruptor "Visible para el cliente" y un límite de consultas por IP.
export const router: Router = Router();

const MINUTE = 60_000;
const viewLimit = rateLimit({ name: "public-quotation", windowMs: 10 * MINUTE, max: 120 });

router.get("/:code", viewLimit, publicQuotationValidator, allValidator, publicQuotationViewController);
router.get("/:code/pdf", viewLimit, publicQuotationValidator, allValidator, publicQuotationPdfController);
