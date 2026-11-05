import { Op, QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc, utcToBusinessParts } from "../../../../../utils/dateUtils";
import { readDriveConfig } from "../../../google_drive/services/shared/config";
import { uploadToCompanyDrive } from "../../../google_drive/services/shared/company_drive";
import { DriveError } from "../../../google_drive/services/shared/drive_client";
import { InvoiceModel } from "../../model/invoice.model";

// Tope de reintentos automáticos (nunca un ciclo sin fin): después de esto la
// copia queda "falló" hasta que alguien pulse "Reintentar".
export const MAX_DRIVE_ATTEMPTS = 8;
// Espera antes de cada reintento, en minutos (crece con cada falla).
const RETRY_DELAYS_MIN = [5, 15, 60, 180, 360, 720, 1440];
// Mientras una copia está en curso, nadie más la toma.
const CLAIM_MINUTES = 10;
const BATCH_SIZE = 20;

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const EXTENSIONS: Record<string, string> = {
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
};

export const quotationCode = (quotationId: number) => `COT-${String(quotationId).padStart(4, "0")}`;
type InvoiceNaming = Pick<InvoiceModel, "id" | "type" | "quotation_id" | "mime_type" | "created_at">;
const typeLabel = (invoice: Pick<InvoiceModel, "type">) => (invoice.type === "issued" ? "Emitida" : "Compra");
const addMinutes = (minutes: number) => new Date(nowUtc().getTime() + minutes * 60_000);

// Carpetas en Drive (pedido explícito del usuario: "todo bien ordenado"):
// Facturas - <empresa> / 2026 / 11 - Noviembre / Emitidas | Compras.
export function driveFolderPath(invoice: Pick<InvoiceModel, "type" | "created_at">): string[] {
  const [year = "", month = "1"] = utcToBusinessParts(invoice.created_at).date.split("-");
  const monthIndex = Number(month) - 1;
  return [year, `${month} - ${MONTHS[monthIndex] ?? month}`, invoice.type === "issued" ? "Emitidas" : "Compras"];
}

export function driveFileName(invoice: InvoiceNaming): string {
  const extension = EXTENSIONS[invoice.mime_type ?? ""] ?? "";
  return `${typeLabel(invoice)} ${quotationCode(Number(invoice.quotation_id))} #${invoice.id}${extension}`;
}

// Super Administradores activos (configuran el Drive de cada empresa).
const loadSystemUserIds = async (): Promise<{ id: number; company_id: number | null }[]> =>
  (await DataBase.instance.sequelize.query(
    `SELECT DISTINCT u.id, u.company_id FROM \`user\` u
     INNER JOIN user_role ur ON ur.user_id = u.id
     INNER JOIN role r ON r.id = ur.role_id AND r.status = true AND r.is_system = true
     WHERE u.is_deleted = false AND u.status = true`,
    { type: QueryTypes.SELECT }
  )) as { id: number; company_id: number | null }[];

/**
 * Alerta en la campana (pedido explícito del usuario: "que sea una alerta si
 * el Drive se quedó sin espacio o no se guardó el archivo"). Le llega a quien
 * subió la factura y a los Super Administradores, una sola vez por falla (no
 * en cada reintento).
 */
async function notifyDriveFailure(invoice: InvoiceModel, reason: string): Promise<void> {
  const company = await DataBase.instance.company.findByPk(invoice.company_id, { attributes: ["business_name"] });
  const systemUsers = await loadSystemUserIds();
  const uploader = invoice.file_uploaded_by
    ? await DataBase.instance.user.findOne({
        where: { id: invoice.file_uploaded_by, is_deleted: false, status: true },
        attributes: ["id", "company_id"],
      })
    : null;
  const recipients = new Map(systemUsers.map((user) => [Number(user.id), user.company_id ?? null]));
  if (uploader) recipients.set(Number(uploader.id), uploader.company_id ?? null);
  if (recipients.size === 0) return;

  const now = nowUtc();
  const message = [
    `Empresa: ${company?.business_name ?? `#${invoice.company_id}`}`,
    `Factura: ${typeLabel(invoice)} de ${quotationCode(Number(invoice.quotation_id))} — ${invoice.description}`,
    `Motivo: ${reason}`,
    "Si también se guarda en el sistema, no se perdió: se reintenta sola. Revisa el Drive de la empresa en Empresas.",
  ]
    .join("\n")
    .slice(0, 500);
  await DataBase.instance.reminder.bulkCreate(
    [...recipients].map(([userId, companyId]) => ({
      id: 0,
      company_id: companyId,
      recipient_user_id: userId,
      title: "Factura no copiada a Google Drive",
      message,
      remind_at: now,
      read_at: null,
      is_deleted: false,
      created_by: invoice.file_uploaded_by ?? userId,
      created_at: now,
      updated_by: invoice.file_uploaded_by ?? userId,
      updated_at: now,
    }))
  );
}

// Toma la copia (si nadie más la tiene): así el reintento automático y una
// subida al mismo tiempo nunca suben dos veces el mismo archivo.
const claimCopy = async (invoiceId: number): Promise<boolean> => {
  const [affected] = await DataBase.instance.invoice.update(
    { drive_next_attempt_at: addMinutes(CLAIM_MINUTES) },
    {
      where: {
        id: invoiceId,
        drive_status: { [Op.in]: ["pending", "failed"] },
        [Op.or]: [{ drive_next_attempt_at: null }, { drive_next_attempt_at: { [Op.lte]: nowUtc() } }],
      },
    }
  );
  return affected > 0;
};

/**
 * Copia a Google Drive una factura guardada en el sistema. Nunca lanza: si
 * falla, la deja "falló" con el motivo, programa el reintento y avisa (una
 * vez). Devuelve si quedó copiada.
 */
export async function copyInvoiceToDrive(invoiceId: number): Promise<boolean> {
  if (!readDriveConfig() || !(await claimCopy(invoiceId))) return false;
  const invoice = await DataBase.instance.invoice.findByPk(invoiceId);
  if (!invoice) return false;

  try {
    const stored = await DataBase.instance.invoice_file.findOne({ where: { invoice_id: invoiceId } });
    if (!stored || !invoice.mime_type) throw new DriveError("No hay copia del archivo en el sistema para enviar a Drive", "other");

    const fileId = await uploadToCompanyDrive({
      companyId: Number(invoice.company_id),
      folderPath: driveFolderPath(invoice),
      name: driveFileName(invoice),
      mimeType: invoice.mime_type,
      data: Buffer.from(stored.data),
    });
    await DataBase.instance.invoice.update(
      { drive_status: "copied", drive_file_id: fileId, drive_error: null, drive_next_attempt_at: null, updated_at: nowUtc() },
      { where: { id: invoiceId } }
    );
    return true;
  } catch (error) {
    const reason = error instanceof DriveError ? error.message : "Error inesperado al copiar a Google Drive";
    if (!(error instanceof DriveError)) console.error("[invoice/drive] Error al copiar la factura", invoiceId, error);
    const attempts = Number(invoice.drive_attempts) + 1;
    const delay = RETRY_DELAYS_MIN[Math.min(attempts - 1, RETRY_DELAYS_MIN.length - 1)] ?? 1440;
    await DataBase.instance.invoice.update(
      {
        drive_status: "failed",
        drive_error: reason.slice(0, 500),
        drive_attempts: attempts,
        drive_next_attempt_at: attempts >= MAX_DRIVE_ATTEMPTS ? null : addMinutes(delay),
        updated_at: nowUtc(),
      },
      { where: { id: invoiceId } }
    );
    // Solo la primera vez que falla (los reintentos no vuelven a avisar).
    if (invoice.drive_status !== "failed") {
      await notifyDriveFailure(invoice, reason).catch((notifyError: unknown) =>
        console.error("[invoice/drive] No se pudo avisar la falla:", notifyError)
      );
    }
    return false;
  }
}

/**
 * Reintento automático: copia las facturas pendientes o fallidas cuyo turno ya
 * llegó, de empresas con Drive activado y conectado. Va de a pocas y en orden
 * (nunca todo de golpe). Lo llama el servidor cada 10 minutos y al conectar un
 * Drive.
 */
export async function retryPendingDriveCopies({ companyId }: { companyId?: number } = {}): Promise<number> {
  if (!readDriveConfig()) return 0;
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT i.id FROM invoice i
     INNER JOIN company c ON c.id = i.company_id AND c.invoice_storage_drive = true
     INNER JOIN company_drive_connection dc ON dc.company_id = i.company_id
     WHERE i.drive_status IN ('pending', 'failed')
       AND i.stored_in_system = true
       AND i.drive_attempts < :maxAttempts
       AND (i.drive_next_attempt_at IS NULL OR i.drive_next_attempt_at <= UTC_TIMESTAMP())
       AND (:companyId IS NULL OR i.company_id = :companyId)
     ORDER BY i.id ASC
     LIMIT :limit`,
    {
      type: QueryTypes.SELECT,
      replacements: { maxAttempts: MAX_DRIVE_ATTEMPTS, companyId: companyId ?? null, limit: BATCH_SIZE },
    }
  )) as { id: number }[];

  let copied = 0;
  for (const row of rows) {
    if (await copyInvoiceToDrive(Number(row.id))) copied += 1;
  }
  return copied;
}
