import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", "latin1");

interface GuideLine {
  product_id: number | null;
  quotation_item_id: number | null;
  description: string;
  color: string;
  quantity: number;
  pending?: number | null;
}

interface Guide {
  id: number;
  status: string;
  number_text: string | null;
  has_pdf: boolean;
  reason_code: string;
  lines: GuideLine[];
  exit_document: { id: number; status: string } | null;
}

/**
 * Sprint 2, ítem 1 — guía de remisión en MODO MANUAL (plan §9): catálogos,
 * precarga desde la cotización, control de lo despachado (entregas
 * parciales), datos obligatorios al registrar, número único (también con
 * registros simultáneos), PDF privado, salida de almacén al registrar (D4) y
 * anulación que la devuelve. Nada se envía a SUNAT. Empresa desechable.
 */
describe("Guías de remisión (modo manual)", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let other: CashClosingTestCompany;
  let warehouseId: number;
  let productId: number;
  let quotationId: number;
  let vehicleId: number;
  let driverId: number;
  let registeredId: number;
  const stamp = wordStamp().slice(0, 6).toUpperCase();
  const series = `T${String(Date.now()).slice(-3)}`;
  const admin = () => authedRequest(ctx.admin.token);
  const gestor = () => authedRequest(ctx.gestor.token);

  const onHand = async () =>
    Number(
      (await queryRows<{ total: number | null }>("SELECT SUM(on_hand) AS total FROM stock_balance WHERE warehouse_id = ? AND product_id = ?", [warehouseId, productId]))[0]
        ?.total ?? 0
    );

  // Lo que SUNAT exige, para completar un borrador antes de registrarlo.
  const completeFields = () => ({
    reason_code: "01",
    transport_mode: "private",
    transfer_start_date: "2026-11-20",
    gross_weight_kg: 12.5,
    origin_warehouse_id: warehouseId,
    destination_address: "Av. Los Olivos 123, Lima",
    destination_ubigeo: "150117",
    recipient_doc_type: "6",
    recipient_doc_number: "20123456789",
    recipient_name: "Cliente Guía SAC",
    vehicle_ids: [vehicleId],
    driver_ids: [driverId],
  });

  const lineOf = (quantity: number) => ({ product_id: productId, description: `Polo Guía ${stamp}`, quantity });

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    other = await createCashClosingTestCompany(superToken);
  }, 120_000);

  afterAll(async () => {
    for (const company of [ctx, other]) {
      if (company?.companyId) await authedRequest(superToken).put(`/company/disable/${company.companyId}`);
    }
  });

  it("sin la funcionalidad, 403; el Super Administrador la prende", async () => {
    const denied = await admin().get("/dispatch-guide/guides");
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("FEATURE_DISABLED");
    const features = { features: { dispatch_guide: true, inventory: true } };
    expect((await authedRequest(superToken).put(`/company-feature/${ctx.companyId}`, features)).status).toBe(200);
    expect((await authedRequest(superToken).put(`/company-feature/${other.companyId}`, features)).status).toBe(200);
  });

  it("almacén con dirección y stock; la tienda descuenta al emitir la guía", async () => {
    const warehouse = await admin().post("/inventory/warehouses", {
      business_unit_id: ctx.storeId,
      code: "PRIN",
      name: "Principal",
      address: "Jr. Gamarra 500, La Victoria",
      ubigeo: "150115",
      sunat_establishment_code: "0001",
      allow_negative_stock: false,
      track_lots: false,
      track_expiry: false,
      expiry_alert_days: 30,
      block_expired: true,
      is_default: true,
    });
    expect(warehouse.status).toBe(201);
    warehouseId = warehouse.body.data.id;
    expect((await admin().put(`/inventory/stores/${ctx.storeId}`, { inventory_enabled: true, inventory_exit_on: "dispatch_guide" })).status).toBe(200);

    productId = (await admin().post("/product/create", { company_id: ctx.companyId, name: `Polo Guía ${stamp}`, price_unit: 20 })).body.data.id;
    const entry = await admin().post("/inventory/documents", {
      doc_type: "entry",
      warehouse_id: warehouseId,
      reason_code: "opening",
      document_date: "2026-11-14",
      lines: [{ product_id: productId, quantity: 10, unit_cost: 8 }],
    });
    expect((await admin().post(`/inventory/documents/${entry.body.data.id}/post`)).status).toBe(200);
    expect(await onHand()).toBe(10);
  });

  it("vehículos y conductores: los configura el admin (placa normalizada, sin repetir); el Gestor solo los usa", async () => {
    const vehicle = await admin().post("/dispatch-guide/vehicles", { plate: "abc-123", description: "Furgoneta" });
    expect(vehicle.status).toBe(201);
    expect(vehicle.body.data.plate).toBe("ABC123");
    vehicleId = vehicle.body.data.id;
    const repeated = await admin().post("/dispatch-guide/vehicles", { plate: "ABC 123" });
    expect(repeated.status).toBe(409);
    expect(repeated.body.code).toBe("VEHICLE_DUPLICATE");

    const driver = await admin().post("/dispatch-guide/drivers", {
      doc_type: "1",
      doc_number: "45678912",
      first_names: "Luis",
      last_names: "Quispe",
      license_number: "Q45678912",
    });
    expect(driver.status).toBe(201);
    driverId = driver.body.data.id;

    expect((await gestor().post("/dispatch-guide/vehicles", { plate: "XYZ999" })).status).toBe(403);
    const list = await gestor().get("/dispatch-guide/vehicles?status=active");
    expect(list.status).toBe(200);
    expect(list.body.data.data.map((row: { id: number }) => row.id)).toEqual([vehicleId]);
    const foreign = await authedRequest(other.admin.token).get("/dispatch-guide/vehicles");
    expect(foreign.body.data.data).toEqual([]);
  });

  it("la cotización tiene que estar Lista o Entregada; la precarga trae lo que falta despachar", async () => {
    const client = await admin().post("/client/create", { company_id: ctx.companyId, name: `Cliente Guía ${stamp}`, document_number: "20123456789", address: "Av. Los Olivos 123" });
    const quotation = await admin().post("/quotation/create", {
      company_id: ctx.companyId,
      business_unit_id: ctx.storeId,
      client_id: client.body.data.id,
      items: [{ product_id: productId, quantity: 6, pricing_mode: "unit" }],
    });
    quotationId = quotation.body.data.id;
    expect((await admin().put(`/quotation/status/${quotationId}`, { status: "accepted" })).status).toBe(200);

    const early = await gestor().get(`/dispatch-guide/prefill?quotationId=${quotationId}`);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe("QUOTATION_NOT_READY");

    for (const status of ["design_pending", "in_process", "ready"]) {
      expect((await admin().put(`/quotation/status/${quotationId}`, { status })).status).toBe(200);
    }
    const prefill = await gestor().get(`/dispatch-guide/prefill?quotationId=${quotationId}`);
    expect(prefill.status).toBe(200);
    expect(prefill.body.data).toMatchObject({
      reason_code: "01",
      origin_warehouse_id: warehouseId,
      origin_ubigeo: "150115",
      recipient_doc_type: "6",
      recipient_doc_number: "20123456789",
    });
    expect(prefill.body.data.lines).toEqual([expect.objectContaining({ product_id: productId, quantity: 6, pending: 6 })]);
  });

  it("entregas parciales: las guías no anuladas no pueden llevar más de lo pedido", async () => {
    const first = await gestor().post("/dispatch-guide/guides", { quotation_id: quotationId, reason_code: "01", transport_mode: "private", lines: [lineOf(4)] });
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe("draft");
    registeredId = first.body.data.id;

    const tooMuch = await gestor().post("/dispatch-guide/guides", { quotation_id: quotationId, reason_code: "01", transport_mode: "private", lines: [lineOf(3)] });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.code).toBe("DISPATCH_EXCEEDS_PENDING");

    const prefill = await gestor().get(`/dispatch-guide/prefill?quotationId=${quotationId}`);
    expect(prefill.body.data.lines[0]).toMatchObject({ pending: 2, dispatched: 4 });
  });

  it("registrar exige los datos de SUNAT y responde todos los faltantes juntos", async () => {
    const incomplete = await gestor().post(`/dispatch-guide/guides/${registeredId}/register`, { series, number: 1 });
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.code).toBe("GUIDE_INCOMPLETE");
    expect(incomplete.body.errors.missing).toEqual(
      expect.arrayContaining(["Fecha de inicio del traslado", "Ubigeo del punto de llegada (6 dígitos)", "Peso bruto total (kg)", "Vehículo (placa)", "Conductor"])
    );
    const badSeries = await gestor().post(`/dispatch-guide/guides/${registeredId}/register`, { series: "F001", number: 1 });
    expect(badSeries.status).toBe(400);
  });

  it("registra la guía emitida con su PDF: número, salida de almacén (D4) e historial, en un paso", async () => {
    const saved = await gestor().put(`/dispatch-guide/guides/${registeredId}`, { ...completeFields(), lines: [lineOf(4)] });
    expect(saved.status).toBe(200);

    const res = await request(BASE_URL)
      .post(`/api/dispatch-guide/guides/${registeredId}/register`)
      .set("Authorization", `Bearer ${ctx.gestor.token}`)
      .field("series", series.toLowerCase())
      .field("number", "1")
      .field("issue_date", "2026-11-20")
      .attach("file", PDF_BYTES, { filename: "guia.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);
    const guide = res.body.data as Guide;
    expect(guide).toMatchObject({ status: "manual", number_text: `${series}-1`, has_pdf: true });
    expect(guide.exit_document?.status).toBe("posted");
    expect(await onHand()).toBe(6);

    const events = await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM quotation_event WHERE quotation_id = ? AND action = 'dispatch_guide_registered'", [quotationId]);
    expect(Number(events[0]?.total)).toBe(1);

    const pdf = await gestor().get(`/dispatch-guide/guides/${registeredId}/file`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");

    expect((await gestor().put(`/dispatch-guide/guides/${registeredId}`, { ...completeFields(), lines: [lineOf(1)] })).status).toBe(409);
  });

  it("el número es único: dos registros simultáneos del mismo número dejan uno solo", async () => {
    const createDraft = async () =>
      (await gestor().post("/dispatch-guide/guides", { quotation_id: quotationId, ...completeFields(), lines: [lineOf(1)] })).body.data.id as number;
    const [a, b] = [await createDraft(), await createDraft()];

    const repeated = await gestor().post(`/dispatch-guide/guides/${a}/register`, { series, number: 1 });
    expect(repeated.status).toBe(409);
    expect(repeated.body.code).toBe("GUIDE_NUMBER_TAKEN");

    const results = await Promise.all([
      gestor().post(`/dispatch-guide/guides/${a}/register`, { series, number: 2 }),
      gestor().post(`/dispatch-guide/guides/${b}/register`, { series, number: 2 }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const rows = await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM dispatch_guide WHERE company_id = ? AND series = ? AND number = 2", [ctx.companyId, series]);
    expect(Number(rows[0]?.total)).toBe(1);

    // El que quedó en borrador se descarta y deja de contar como despachado.
    const loser = results[0]?.status === 409 ? a : b;
    const discarded = await gestor().post(`/dispatch-guide/guides/${loser}/discard`);
    expect(discarded.status).toBe(200);
    expect(discarded.body.data.status).toBe("voided");
  });

  it("otra empresa no ve la guía; el Gestor ve solo las de su tienda", async () => {
    expect((await authedRequest(other.admin.token).get(`/dispatch-guide/guides/${registeredId}`)).status).toBe(404);
    const list = await gestor().get(`/dispatch-guide/guides?searchTerm=${series}-1`);
    expect(list.body.data.data.map((row: { id: number }) => row.id)).toEqual([registeredId]);
  });

  it("anular la guía registrada la deja anulada, devuelve el stock y libera lo despachado", async () => {
    const byGestor = await gestor().post(`/dispatch-guide/guides/${registeredId}/void`, { reason: "Se emitió con el peso errado" });
    expect(byGestor.status).toBe(403);

    const voided = await admin().post(`/dispatch-guide/guides/${registeredId}/void`, { reason: "Se emitió con el peso errado" });
    expect(voided.status).toBe(200);
    expect(voided.body.data.status).toBe("voided");
    expect(await onHand()).toBe(9);

    const prefill = await gestor().get(`/dispatch-guide/prefill?quotationId=${quotationId}`);
    expect(prefill.body.data.lines[0]).toMatchObject({ pending: 5, dispatched: 1 });
  });
});
