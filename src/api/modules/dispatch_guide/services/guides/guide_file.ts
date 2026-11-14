import { createHash } from "crypto";
import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { GuideFileInput } from "../../types/dispatch_guide.types";

// Nombre original sin rutas ni caracteres raros (solo se muestra).
const cleanFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").slice(-200) || "guia";

/**
 * Guarda (o reemplaza) el PDF de la guía emitida en SUNAT, en la base y no en
 * disco (Hostinger borra el disco en cada despliegue). Va en la transacción
 * del llamador: al registrar la guía, número y archivo quedan juntos o nada.
 */
export const saveGuidePdf = async ({
  guideId,
  companyId,
  file,
  actorId,
  transaction,
}: {
  guideId: number;
  companyId: number;
  file: GuideFileInput;
  actorId: number;
  transaction: Transaction;
}): Promise<void> => {
  const now = nowUtc();
  const fields = {
    file_name: cleanFileName(file.originalname),
    mime_type: file.mimetype,
    size_bytes: file.buffer.length,
    sha256: createHash("sha256").update(file.buffer).digest("hex"),
    content: file.buffer,
    updated_by: actorId,
    updated_at: now,
  };
  const existing = await DataBase.instance.dispatch_guide_file.findOne({ where: { guide_id: guideId, kind: "pdf" }, attributes: ["id"], transaction });
  if (existing) {
    await DataBase.instance.dispatch_guide_file.update(fields, { where: { id: existing.id }, transaction });
    return;
  }
  await DataBase.instance.dispatch_guide_file.create(
    { id: 0, company_id: companyId, guide_id: guideId, kind: "pdf", ...fields, created_by: actorId, created_at: now },
    { transaction }
  );
};
