import { authedRequest, login, wordStamp } from "./helpers/apiClient";
import { createUnscopedCompanyAdmin } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

// Fecha y hora de Lima desplazadas `minutes` desde ahora (formato del formulario).
const limaParts = (minutes: number) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(Date.now() + minutes * 60_000));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
};

/**
 * Buscador de Recordatorios (pedido explícito del usuario: filtros en la lista
 * de alertas). Busca en título y mensaje; los comodines de SQL se toman como
 * texto. Empresa y admin desechables: nunca usa las cuentas QA del equipo.
 */
describe("Recordatorios: búsqueda", () => {
  let token: string;
  const stamp = wordStamp();

  beforeAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const company = await authedRequest(superToken).post("/company/create", {
      ruc: `20${String(Date.now()).slice(-8)}7`,
      business_name: `Recordatorios ${stamp}`,
    });
    token = (await createUnscopedCompanyAdmin(superToken, company.body.data.id)).token;

    const api = authedRequest(token);
    const { date, time } = limaParts(180);
    await api.post("/reminder/create", { title: `Llamar proveedor ${stamp}`, remind_date: date, remind_time: time });
    await api.post("/reminder/create", {
      title: "Revisar caja",
      message: `Cuadrar el 100% del efectivo ${stamp}`,
      remind_date: date,
      remind_time: time,
    });
  });

  const titles = async (search: string) => {
    const res = await authedRequest(token).get(`/reminder/list?box=sent&search=${encodeURIComponent(search)}`);
    expect(res.status).toBe(200);
    return (res.body.data.data as { title: string }[]).map((row) => row.title);
  };

  it("busca en el título", async () => {
    expect(await titles("proveedor")).toEqual([`Llamar proveedor ${stamp}`]);
  });

  it("busca en el mensaje", async () => {
    expect(await titles("efectivo")).toEqual(["Revisar caja"]);
  });

  it("% se busca como texto, no como comodín", async () => {
    expect(await titles("100%")).toEqual(["Revisar caja"]);
    expect(await titles("%")).toEqual(["Revisar caja"]);
  });

  it("sin coincidencias devuelve vacío", async () => {
    expect(await titles("no-existe-nada")).toEqual([]);
  });
});
