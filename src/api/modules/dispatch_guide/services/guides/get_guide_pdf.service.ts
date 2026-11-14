import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { FileDownload } from "../../types/dispatch_guide.types";
import { loadGuideForCaller } from "./guide_shared";

// El PDF es privado: se sirve solo con sesión, nunca por una URL pública.
export const getGuidePdfService = async (id: number, user: IToken): Promise<FileDownload> => {
  const guide = await loadGuideForCaller(id, user, "read");
  const file = await DataBase.instance.dispatch_guide_file.findOne({ where: { guide_id: guide.id, kind: "pdf" } });
  if (!file) throw new AppError(404, "La guía no tiene PDF", undefined, "GUIDE_FILE_NOT_FOUND");
  return { fileName: file.file_name, mimeType: file.mime_type, data: Buffer.from(file.content) };
};
