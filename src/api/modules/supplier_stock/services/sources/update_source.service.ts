import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import { assertSupplierInCompany, findSourceForCaller, toSourceDtos } from "../shared/source_shared";
import { cleanColumnMap, sealSourceUrl } from "../shared/source_input";
import type { StockSourceDto, StockSourceInput } from "../../types/supplier_stock.types";

// Edita una fuente. Sin `url` se conserva el enlace guardado (nunca se
// devuelve en claro, así que el formulario no lo tiene).
export const updateSourceService = async (id: number, input: StockSourceInput, user: IToken): Promise<StockSourceDto> => {
  const source = await findSourceForCaller(id, user);
  await assertSupplierInCompany(input.supplier_id, Number(source.company_id));
  const url = input.url?.trim();
  const urlEncrypted = input.source_type === "upload" ? null : url ? sealSourceUrl(url) : source.url_encrypted;
  if (input.source_type === "url" && !urlEncrypted) throw new AppError(400, "Pega el enlace del Excel del proveedor");

  await source.update({
    supplier_id: input.supplier_id,
    name: input.name.trim(),
    source_type: input.source_type,
    url_encrypted: urlEncrypted,
    sheet_name: input.sheet_name?.trim() || null,
    header_row: input.header_row,
    column_map: cleanColumnMap(input.column_map),
    refresh_minutes: input.refresh_minutes,
    updated_by: user.userId,
    updated_at: nowUtc(),
  });
  const [dto] = await toSourceDtos([source]);
  return dto as StockSourceDto;
};
