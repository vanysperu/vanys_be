import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { loadDriveConnection, uploadToCompanyDrive } from "../../google_drive/services/shared/company_drive";
import { DriveError } from "../../google_drive/services/shared/drive_client";
import { InvoiceActor, UploadedInvoiceFile } from "../types/invoice.types";
import { copyInvoiceToDrive, driveFileName, driveFolderPath } from "./shared/drive_copy";
import { loadInvoiceForActor } from "./shared/invoice_scope";

// Nombre original sin rutas ni caracteres raros (solo se muestra).
const cleanFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").slice(-200) || "factura";

/**
 * Sube (o reemplaza) el archivo de una factura. Dónde se guarda lo decide la
 * empresa (lo configura el Super Administrador):
 * - Sistema: se guarda acá; si además tiene Drive, se copia a Drive por
 *   detrás (si Drive falla, la factura no se pierde: se reintenta y se avisa).
 * - Solo Drive: primero se sube a Drive y recién después se registra; si
 *   Drive falla, no se guarda nada y se responde el motivo.
 * Un archivo reemplazado en Drive NO se borra allá (nunca se borra nada en Drive).
 */
export async function uploadInvoiceFileService(id: number, file: UploadedInvoiceFile, actor: InvoiceActor) {
  const current = await loadInvoiceForActor(id, actor);
  const company = await DataBase.instance.company.findByPk(current.company_id, {
    attributes: ["invoice_storage_system", "invoice_storage_drive"],
  });
  const inSystem = Boolean(company?.invoice_storage_system);
  const inDrive = Boolean(company?.invoice_storage_drive);
  if (!inSystem && !inDrive) {
    throw new AppError(
      409,
      "La empresa no tiene activado dónde guardar facturas. Lo activa el Super Administrador en Empresas.",
      undefined,
      "INVOICE_STORAGE_DISABLED"
    );
  }

  const fileFields = {
    file_name: cleanFileName(file.originalname),
    mime_type: file.mimetype,
    size_bytes: file.size,
    file_uploaded_at: nowUtc(),
    file_uploaded_by: actor.userId,
  };

  // Solo Drive: el paso externo va primero (CLAUDE.md 12: nunca dejar el
  // registro confirmado si el archivo no llegó a ningún lado).
  if (!inSystem) {
    if (!(await loadDriveConnection(Number(current.company_id)))) {
      throw new AppError(409, "La empresa guarda facturas solo en Google Drive y no tiene uno conectado", undefined, "DRIVE_NOT_CONNECTED");
    }
    let driveFileId: string;
    try {
      driveFileId = await uploadToCompanyDrive({
        companyId: Number(current.company_id),
        folderPath: driveFolderPath(current),
        name: driveFileName({
          id: current.id,
          type: current.type,
          quotation_id: current.quotation_id,
          created_at: current.created_at,
          mime_type: file.mimetype,
        }),
        mimeType: file.mimetype,
        data: file.buffer,
      });
    } catch (error) {
      if (error instanceof DriveError) throw new AppError(502, `No se pudo guardar en Google Drive: ${error.message}`, undefined, "DRIVE_UPLOAD_FAILED");
      throw error;
    }
    await DataBase.instance.invoice.update(
      {
        ...fileFields,
        stored_in_system: false,
        drive_status: "copied",
        drive_file_id: driveFileId,
        drive_error: null,
        drive_attempts: 0,
        drive_next_attempt_at: null,
        updated_by: actor.userId,
        updated_at: nowUtc(),
      },
      { where: { id } }
    );
    return { id, stored_in_system: false, drive_status: "copied" as const };
  }

  await DataBase.instance.sequelize.transaction(async (transaction) => {
    await loadInvoiceForActor(id, actor, transaction);
    const now = nowUtc();
    const existing = await DataBase.instance.invoice_file.findOne({ where: { invoice_id: id }, attributes: ["id"], transaction });
    if (existing) {
      await DataBase.instance.invoice_file.update(
        { data: file.buffer, updated_by: actor.userId, updated_at: now },
        { where: { id: existing.id }, transaction }
      );
    } else {
      await DataBase.instance.invoice_file.create(
        { id: 0, invoice_id: id, data: file.buffer, created_by: actor.userId, created_at: now, updated_by: actor.userId, updated_at: now },
        { transaction }
      );
    }
    await DataBase.instance.invoice.update(
      {
        ...fileFields,
        stored_in_system: true,
        drive_status: inDrive ? "pending" : "none",
        drive_file_id: null,
        drive_error: null,
        drive_attempts: 0,
        drive_next_attempt_at: null,
        updated_by: actor.userId,
        updated_at: now,
      },
      { where: { id }, transaction }
    );
  });

  // La copia a Drive va por detrás: la persona no espera a Google.
  if (inDrive) {
    void copyInvoiceToDrive(id).catch((error: unknown) => console.error("[invoice/drive] Error al copiar:", error));
  }
  return { id, stored_in_system: true, drive_status: inDrive ? ("pending" as const) : ("none" as const) };
}
