import { AppError } from "../../../../../core/errors/AppError";
import { sealSecret } from "../../../../../core/security/secretBox";
import { toDirectDownloadUrl } from "./safe_download";
import type { StockSourceInput } from "../../types/supplier_stock.types";

// Valida el enlace (https y formato) antes de cifrarlo. La IP se valida al
// descargar: un dominio puede cambiar de IP después.
export const sealSourceUrl = (url: string): string => {
  const parsed = toDirectDownloadUrl(url);
  if (parsed.protocol !== "https:") throw new AppError(400, "Solo se aceptan enlaces https", undefined, "STOCK_URL_NOT_ALLOWED");
  return sealSecret(url.trim());
};

export const cleanColumnMap = (map: StockSourceInput["column_map"]) => ({
  code: map.code.trim(),
  quantity: map.quantity.trim(),
  color: map.color?.trim() || null,
  description: map.description?.trim() || null,
  price: map.price?.trim() || null,
});
