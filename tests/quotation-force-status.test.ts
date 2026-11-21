import { authedRequest, login, wordStamp } from "./helpers/apiClient";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

interface Detail {
  status: string;
  valid_until: string | null;
  events: { action: string; description: string }[];
}

/**
 * Pedido del usuario (21-nov): los administradores mueven una cotización a
 * CUALQUIER estado con un selector y la pueden devolver. Botón RBAC
 * cotizacion.forceStatus.button (admins, nunca el Gestor). Las reglas del
 * dinero siguen valiendo. Empresa desechable.
 */
describe("Cotización: cambio de estado a mano (administradores)", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let clientId: number;
  let productId: number;
  const admin = () => authedRequest(ctx.admin.token);
  const gestor = () => authedRequest(ctx.gestor.token);
  const detail = async (id: number) => (await admin().get(`/quotation/find/${id}`)).body.data as Detail;
  const force = (id: number, status: string, note?: string, api = admin()) => api.put(`/quotation/force-status/${id}`, { status, note });

  const newQuotation = async (): Promise<number> => {
    const created = await admin().post("/quotation/create", {
      company_id: ctx.companyId,
      business_unit_id: ctx.storeId,
      client_id: clientId,
      items: [{ product_id: productId, quantity: 10, pricing_mode: "unit" }],
    });
    expect(created.status).toBeLessThan(300);
    return created.body.data.id as number;
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    const stamp = wordStamp().slice(0, 6);
    clientId = (await admin().post("/client/create", { company_id: ctx.companyId, name: `Cliente Forzar ${stamp}` })).body.data.id;
    productId = (await admin().post("/product/create", { company_id: ctx.companyId, name: `Polo Forzar ${stamp}`, price_unit: 20 })).body.data.id;
  }, 90_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("el Gestor no tiene el permiso (403)", async () => {
    const id = await newQuotation();
    const res = await force(id, "in_process", undefined, gestor());
    expect(res.status).toBe(403);
    expect((await detail(id)).status).toBe("pending");
  });

  it("el admin salta pasos hacia adelante y hacia atrás, con motivo en el historial", async () => {
    const id = await newQuotation();
    const forward = await force(id, "ready", "El cliente ya aprobó por WhatsApp");
    expect(forward.status).toBe(200);
    expect(forward.body.data.status).toBe("ready");
    const afterForward = await detail(id);
    expect(afterForward.status).toBe("ready");
    const event = afterForward.events.find((row) => row.action === "status_forced");
    expect(event?.description).toContain("Pendiente");
    expect(event?.description).toContain("El cliente ya aprobó por WhatsApp");

    // Y la devuelve (sin dinero de por medio puede volver a Pendiente).
    const back = await force(id, "pending");
    expect(back.status).toBe(200);
    const afterBack = await detail(id);
    expect(afterBack.status).toBe("pending");
    // Vigencia nueva: no vencida.
    expect(afterBack.valid_until).not.toBeNull();
    expect(new Date(`${afterBack.valid_until}`.slice(0, 10)).getTime()).toBeGreaterThanOrEqual(new Date(new Date().toISOString().slice(0, 10)).getTime());
  });

  it("un estado final (Finalizada, Cancelada) se puede reabrir; avisa si no hay factura", async () => {
    const id = await newQuotation();
    const finished = await force(id, "finished");
    expect(finished.status).toBe(200);
    expect((finished.body.data.warnings as string[]).some((text) => text.includes("factura"))).toBe(true);
    expect((await force(id, "in_process")).status).toBe(200);
    expect((await force(id, "cancelled")).status).toBe(200);
    expect((await force(id, "accepted")).status).toBe(200);
    expect((await detail(id)).status).toBe("accepted");
  });

  it("no permite el mismo estado ni volver a Pendiente de cotizar", async () => {
    const id = await newQuotation();
    const same = await force(id, "pending");
    expect(same.status).toBe(400);
    expect(same.body.code).toBe("SAME_STATUS");
    expect((await force(id, "quote_requested")).status).toBe(400);
  });

  it("con pagos no se puede cancelar, rechazar, vencer ni volver a Pendiente (409)", async () => {
    const id = await newQuotation();
    expect((await force(id, "accepted")).status).toBe(200);
    const paid = await admin().post(`/quotation/${id}/payments`, { amount: 50, method: "cash", paid_at: "2026-11-20" });
    expect(paid.status).toBe(201);
    for (const target of ["cancelled", "rejected", "expired", "pending"]) {
      const res = await force(id, target);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("QUOTATION_HAS_MONEY");
    }
    // Hacia adelante sí (el dinero no queda colgado).
    expect((await force(id, "in_process")).status).toBe(200);
  });
});
