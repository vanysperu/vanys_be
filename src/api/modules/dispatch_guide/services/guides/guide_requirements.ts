import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import type { DispatchGuideModel } from "../../model/dispatch_guide.models";

// Serie de la guía de remisión remitente electrónica: T + 3 caracteres (plan §9.1).
export const GUIDE_SERIES_PATTERN = /^T[A-Z0-9]{3}$/;
const UBIGEO_PATTERN = /^\d{6}$/;
const ESTABLISHMENT_PATTERN = /^\d{4}$/;

/**
 * Lo que SUNAT exige en la guía (plan §9.2). Un borrador puede quedar
 * incompleto; al registrar la guía emitida se revisa todo de una vez y se
 * responden TODOS los faltantes juntos (no uno por intento), para que la
 * persona los complete antes de emitirla en SEE-SOL.
 */
export const assertGuideComplete = async (guide: DispatchGuideModel, transaction: Transaction): Promise<void> => {
  const [lines, transports] = await Promise.all([
    DataBase.instance.dispatch_guide_line.findAll({ where: { guide_id: guide.id }, attributes: ["quantity", "description"], transaction }),
    DataBase.instance.dispatch_guide_transport.findAll({ where: { guide_id: guide.id }, attributes: ["kind"], transaction }),
  ]);
  const missing: string[] = [];
  const need = (condition: boolean, label: string) => {
    if (!condition) missing.push(label);
  };

  need(Boolean(guide.transfer_start_date), "Fecha de inicio del traslado");
  need(Boolean(guide.recipient_doc_type && guide.recipient_doc_number), "Documento del destinatario");
  need(Boolean(guide.recipient_name), "Nombre del destinatario");
  need(Boolean(guide.origin_address), "Dirección del punto de partida");
  need(UBIGEO_PATTERN.test(guide.origin_ubigeo ?? ""), "Ubigeo del punto de partida (6 dígitos)");
  need(Boolean(guide.destination_address), "Dirección del punto de llegada");
  need(UBIGEO_PATTERN.test(guide.destination_ubigeo ?? ""), "Ubigeo del punto de llegada (6 dígitos)");
  // Traslado entre establecimientos: el código de establecimiento de los dos puntos.
  if (guide.reason_code === "04") {
    need(ESTABLISHMENT_PATTERN.test(guide.origin_establishment_code ?? ""), "Código de establecimiento de partida (4 dígitos)");
    need(ESTABLISHMENT_PATTERN.test(guide.destination_establishment_code ?? ""), "Código de establecimiento de llegada (4 dígitos)");
  }
  need(Number(guide.gross_weight_kg ?? 0) > 0, "Peso bruto total (kg)");
  need(lines.length > 0 && lines.every((line) => Number(line.quantity) > 0 && line.description.trim().length > 0), "Al menos un bien con cantidad");
  if (guide.reason_code === "13") need(Boolean(guide.reason_note), "Descripción del motivo (motivo 13: Otros)");

  if (guide.transport_mode === "public") {
    need(/^\d{11}$/.test(guide.carrier_ruc ?? ""), "RUC del transportista");
    need(Boolean(guide.carrier_name), "Razón social del transportista");
  }
  // Transporte privado: placa y conductor, salvo vehículo liviano (M1 o L).
  if (guide.transport_mode === "private" && !guide.light_vehicle) {
    need(transports.some((transport) => transport.kind === "vehicle"), "Vehículo (placa)");
    need(transports.some((transport) => transport.kind === "driver"), "Conductor");
  }

  if (missing.length === 0) return;
  throw new AppError(400, `Faltan datos de la guía: ${missing.join(", ")}`, { missing }, "GUIDE_INCOMPLETE");
};
