import { IToken } from "../../../../interfaces/IToken.interface";
import { nowUtc } from "../../../../../utils/dateUtils";
import { findSourceForCaller, toSourceDtos } from "../shared/source_shared";
import type { StockSourceDto } from "../../types/supplier_stock.types";

// Deshabilitar / habilitar (soft-delete). Una fuente deshabilitada no se
// actualiza ni se muestra al cotizar; su última lectura queda.
export const toggleSourceService = async (id: number, user: IToken): Promise<StockSourceDto> => {
  const source = await findSourceForCaller(id, user);
  await source.update({ active: !source.active, updated_by: user.userId, updated_at: nowUtc() });
  const [dto] = await toSourceDtos([source]);
  return dto as StockSourceDto;
};
