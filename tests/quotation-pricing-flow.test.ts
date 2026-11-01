import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { todayInBusinessTz } from "../src/utils/dateUtils";

// Cálculo de precios y reglas de dinero de punta a punta, contra el backend
// real (igual que el resto de tests de API).
describe("Cotización: precios, IGV y dinero en el flujo", () => {
  let token: string;
  let companyId: number;

  beforeAll(async () => {
    token = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    companyId = (await authedRequest(token).get("/access/me")).body.data.companyId;
  });

  // Ejemplo del usuario: jabón unidad 1 / ciento 0.90 / medio millar 0.80 /
  // millar 0.50 y serigrafía unidad 2 / ciento 0.95 / medio millar 0.85 /
  // millar 0.55.
  const createSoapAndScreenPrint = async () => {
    const api = authedRequest(token);
    const stamp = wordStamp();
    const client = await api.post("/client/create", { company_id: companyId, name: `PricingClient${stamp}` });
    const product = await api.post("/product/create", {
      company_id: companyId,
      name: `Jabon${stamp}`,
      price_unit: 1,
      price_hundred: 0.9,
      price_half_thousand: 0.8,
      price_thousand: 0.5,
      requires_customization: true,
    });
    const technique = await api.post("/customization-technique/create", {
      company_id: companyId,
      name: `Serigrafia${stamp}`,
      price_unit: 2,
      price_hundred: 0.95,
      price_half_thousand: 0.85,
      price_thousand: 0.55,
    });
    return { clientId: client.body.data.id as number, productId: product.body.data.id as number, techniqueId: technique.body.data.id as number };
  };

  it("(0.90 + 0.95) × 10 = 18.50, IGV 3.33, total 21.83 — y el detalle dice lo mismo", async () => {
    const api = authedRequest(token);
    const { clientId, productId, techniqueId } = await createSoapAndScreenPrint();

    const created = await api.post("/quotation/create", {
      company_id: companyId,
      client_id: clientId,
      includes_igv: true,
      items: [{ product_id: productId, technique_id: techniqueId, quantity: 10, pricing_mode: "hundred" }],
    });
    expect(created.status).toBe(201);
    expect(Number(created.body.data.subtotal)).toBe(18.5);
    expect(Number(created.body.data.total)).toBe(21.83);

    const detail = await api.get(`/quotation/find/${created.body.data.id}`);
    expect(Number(detail.body.data.items[0].unit_price)).toBe(1.85);
    expect(Number(detail.body.data.items[0].subtotal)).toBe(18.5);
    expect(Number(detail.body.data.total)).toBe(21.83);
  });

  it("el medio céntimo de IGV se redondea hacia arriba: 4.99 × 75 = 374.25 -> total 441.62", async () => {
    const api = authedRequest(token);
    const stamp = wordStamp();
    const client = await api.post("/client/create", { company_id: companyId, name: `HalfCentClient${stamp}` });
    const product = await api.post("/product/create", { company_id: companyId, name: `HalfCent${stamp}`, price_unit: 4.99 });

    const created = await api.post("/quotation/create", {
      company_id: companyId,
      client_id: client.body.data.id,
      includes_igv: true,
      items: [{ product_id: product.body.data.id, quantity: 75, pricing_mode: "unit" }],
    });
    expect(created.status).toBe(201);
    expect(Number(created.body.data.subtotal)).toBe(374.25);
    // Antes: 441.61 (374.25 × 1.18 = 441.61499999999995 en binario).
    expect(Number(created.body.data.total)).toBe(441.62);
  });

  it("el historial sale del más reciente al más antiguo y los items en el orden cargado", async () => {
    const api = authedRequest(token);
    const { clientId, productId, techniqueId } = await createSoapAndScreenPrint();

    const created = await api.post("/quotation/create", {
      company_id: companyId,
      client_id: clientId,
      items: [
        { product_id: productId, technique_id: techniqueId, quantity: 100, pricing_mode: "hundred" },
        { product_id: productId, technique_id: techniqueId, quantity: 1000, pricing_mode: "thousand" },
      ],
    });
    const id = created.body.data.id;
    await api.put(`/quotation/status/${id}`, { status: "accepted" });

    const detail = await api.get(`/quotation/find/${id}`);
    const events = detail.body.data.events as { action: string }[];
    expect(events[0]?.action).toBe("status_changed");
    expect(events[events.length - 1]?.action).toBe("created");
    const items = detail.body.data.items as { id: number; pricing_mode: string }[];
    expect(items.map((item) => item.pricing_mode)).toEqual(["hundred", "thousand"]);
    expect(items[0]!.id).toBeLessThan(items[1]!.id);
  });

  it("no deja volver de Aceptada a Pendiente si ya se cobró un adelanto", async () => {
    const api = authedRequest(token);
    const { clientId, productId, techniqueId } = await createSoapAndScreenPrint();
    const create = () =>
      api.post("/quotation/create", {
        company_id: companyId,
        client_id: clientId,
        items: [{ product_id: productId, technique_id: techniqueId, quantity: 10, pricing_mode: "unit" }],
      });

    const withAdvance = (await create()).body.data.id;
    const accepted = await api.put(`/quotation/status/${withAdvance}`, {
      status: "accepted",
      advance_payment: { amount: 10, method: "cash", paid_at: todayInBusinessTz() },
    });
    expect(accepted.status).toBe(200);

    const back = await api.put(`/quotation/status/${withAdvance}`, { status: "pending" });
    expect(back.status).toBe(400);
    expect(back.body.message).toMatch(/volver a Pendiente.*pagos registrados/i);

    // Sin dinero de por medio, retroceder sigue permitido.
    const withoutMoney = (await create()).body.data.id;
    await api.put(`/quotation/status/${withoutMoney}`, { status: "accepted" });
    const backFree = await api.put(`/quotation/status/${withoutMoney}`, { status: "pending" });
    expect(backFree.status).toBe(200);
  });

  it("quitar el IGV no puede dejar el total por debajo de lo ya pagado", async () => {
    const api = authedRequest(token);
    const { clientId, productId, techniqueId } = await createSoapAndScreenPrint();
    const created = await api.post("/quotation/create", {
      company_id: companyId,
      client_id: clientId,
      includes_igv: true,
      items: [{ product_id: productId, technique_id: techniqueId, quantity: 10, pricing_mode: "hundred" }],
    });
    const id = created.body.data.id;

    // Paga todo (21.83); sin IGV el total sería 18.50.
    const accepted = await api.put(`/quotation/status/${id}`, {
      status: "accepted",
      advance_payment: { amount: 21.83, method: "cash", paid_at: todayInBusinessTz() },
    });
    expect(accepted.status).toBe(200);

    const update = await api.put(`/quotation/update/${id}`, { includes_igv: false });
    expect(update.status).toBe(400);
    expect(update.body.message).toMatch(/No se puede quitar el IGV/);

    const detail = await api.get(`/quotation/find/${id}`);
    expect(Number(detail.body.data.total)).toBe(21.83);
  });
});
