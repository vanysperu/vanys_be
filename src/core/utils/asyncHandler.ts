import { Request, Response, NextFunction, RequestHandler } from "express";

// Envuelve controllers async para que cualquier rechazo de promesa (o
// AppError lanzado) llegue al errorHandler central en vez de colgar el
// request o requerir un try/catch manual en cada controller.
export const asyncHandler = (fn: RequestHandler): RequestHandler => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
