import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { assertCompanyHasStockFeature, assertSupplierInCompany, toSourceDtos } from "../shared/source_shared";
import { cleanColumnMap, sealSourceUrl } from "../shared/source_input";
import type { StockSourceDto, StockSourceInput } from "../../types/supplier_stock.types";

// Crea una fuente de stock. La empresa ya viene resuelta por el controller.
export const createSourceService = async (companyId: number, input: StockSourceInput, actorId: number): Promise<StockSourceDto> => {
  await assertCompanyHasStockFeature(companyId);
  await assertSupplierInCompany(input.supplier_id, companyId);
  const url = input.url?.trim();
  if (input.source_type === "url" && !url) throw new AppError(400, "Pega el enlace del Excel del proveedor");

  const now = nowUtc();
  const source = await DataBase.instance.supplier_stock_source.create({
    id: 0,
    company_id: companyId,
    supplier_id: input.supplier_id,
    name: input.name.trim(),
    source_type: input.source_type,
    url_encrypted: input.source_type === "url" && url ? sealSourceUrl(url) : null,
    sheet_name: input.sheet_name?.trim() || null,
    header_row: input.header_row,
    column_map: cleanColumnMap(input.column_map),
    refresh_minutes: input.refresh_minutes,
    last_import_id: null,
    last_success_at: null,
    last_status: "never",
    last_error: null,
    active: true,
    created_by: actorId,
    created_at: now,
    updated_by: actorId,
    updated_at: now,
  });
  const [dto] = await toSourceDtos([source]);
  return dto as StockSourceDto;
};
