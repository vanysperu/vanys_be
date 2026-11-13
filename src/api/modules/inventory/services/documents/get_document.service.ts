import { IToken } from "../../../../interfaces/IToken.interface";
import type { DocumentDto } from "../../types/inventory.types";
import { loadDocumentForCaller, toDocumentDtos } from "./document_shared";

// Detalle de un documento con sus líneas.
export const getDocumentService = async (id: number, user: IToken): Promise<DocumentDto> => {
  const { document } = await loadDocumentForCaller(id, user);
  const [dto] = await toDocumentDtos([document], user, true);
  return dto as DocumentDto;
};
