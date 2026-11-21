import { IToken } from "../../../../interfaces/IToken.interface";
import { loadReadableMockup } from "./mockup_shared";

// El archivo de un mockup, solo con sesión y con el alcance de lectura de su
// cotización (los diseños del cliente nunca tienen una URL pública).
export async function getMockupFileService(
  mockupId: number,
  user: IToken
): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
  const mockup = await loadReadableMockup(mockupId, user, true);
  return { data: Buffer.from(mockup.data), mimeType: mockup.mime_type, fileName: mockup.file_name };
}
