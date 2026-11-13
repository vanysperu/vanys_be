import { IToken } from "../../../../interfaces/IToken.interface";
import { AppError } from "../../../../../core/errors/AppError";
import { findSourceForCaller, toSourceDtos } from "../shared/source_shared";
import { runSourceImport } from "./run_import";
import type { StockSourceDto } from "../../types/supplier_stock.types";

// "Actualizar ahora": descarga el enlace de la fuente, o lee el archivo
// subido (fuentes de tipo "upload" o para reemplazar a mano una lectura).
export const refreshSourceService = async (id: number, user: IToken, buffer?: Buffer): Promise<StockSourceDto> => {
  const source = await findSourceForCaller(id, user);
  if (!source.active) throw new AppError(409, "La fuente está deshabilitada");
  await runSourceImport({ source, trigger: buffer ? "upload" : "manual", actorId: user.userId, buffer });
  await source.reload();
  const [dto] = await toSourceDtos([source]);
  return dto as StockSourceDto;
};
