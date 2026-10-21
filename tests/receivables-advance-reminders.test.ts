import { authedRequest, login, QA_COMPANY_ADMIN } from "./helpers/apiClient";
import { createQuotationFixture } from "./helpers/fixtures";

const QA_GESTOR = { email: "gestor.qa@acme.test", password: "Test1234" };
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

describe("Adelanto al aceptar, Por cobrar y Recordatorios", () => {
  let token: string;
  let userId: number;
  let companyId: number;

  beforeAll(async () => {
    const auth = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
    token = auth.token;
    userId = auth.userId;
    companyId = (await authedRequest(token).get("/access/me")).body.data.companyId;
  });

  // Los recordatorios de prueba no deben quedar sonando: sus avisos taparían
  // las pantallas en la suite E2E (que usa las mismas cuentas QA).
  afterAll(async () => {
    const gestor = await login(QA_GESTOR.email, QA_GESTOR.password);
    for (const accountToken of [token, gestor.token]) {
      const api = authedRequest(accountToken);
      const due = await api.get("/reminder/due");
      for (const reminder of due.body.data?.data ?? []) await api.put(`/reminder/read/${reminder.id}`);
      const upcoming = await api.get("/reminder/list?box=sent&status=upcoming&limit=100");
      for (const reminder of upcoming.body.data?.data ?? []) await api.put(`/reminder/disable/${reminder.id}`);
    }
  });

  // La fixture crea 10 unidades a (20 + 5): total 250.
  const advance = (amount: number) => ({ amount, method: "cash", paid_at: "2026-10-18" });

  describe("Adelanto al pasar a Aceptada", () => {
    it("acepta y registra el adelanto en una sola operación", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);

      const res = await api.put(`/quotation/status/${quotationId}`, { status: "accepted", advance_payment: advance(125) });
      expect(res.status).toBe(200);

      const detail = await api.get(`/quotation/find/${quotationId}`);
      expect(detail.body.data.status).toBe("accepted");
      expect(Number(detail.body.data.total_paid)).toBe(125);
      expect(detail.body.data.payments).toHaveLength(1);
      expect(detail.body.data.payments[0].notes).toBe("Adelanto");
      const descriptions = detail.body.data.events.map((event: { description: string }) => event.description);
      expect(descriptions.some((text: string) => /Adelanto registrado por S\/ 125\.00/.test(text))).toBe(true);
    });

    it("sin adelanto sigue funcionando como antes", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);

      const res = await api.put(`/quotation/status/${quotationId}`, { status: "accepted" });
      expect(res.status).toBe(200);
      const detail = await api.get(`/quotation/find/${quotationId}`);
      expect(Number(detail.body.data.total_paid)).toBe(0);
    });

    it("si el adelanto supera el total, no acepta ni registra nada (rollback)", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);

      const res = await api.put(`/quotation/status/${quotationId}`, { status: "accepted", advance_payment: advance(999) });
      expect(res.status).toBe(400);

      const detail = await api.get(`/quotation/find/${quotationId}`);
      expect(detail.body.data.status).toBe("pending");
      expect(detail.body.data.payments).toHaveLength(0);
    });

    it("rechaza un adelanto en un cambio de estado que no es aceptar", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);

      const res = await api.put(`/quotation/status/${quotationId}`, { status: "rejected", advance_payment: advance(10) });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/solo se puede registrar al aceptar/);
    });

    it("exige número de operación si el adelanto no es en efectivo", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);

      const res = await api.put(`/quotation/status/${quotationId}`, {
        status: "accepted",
        advance_payment: { amount: 50, method: "yape", paid_at: "2026-10-18" },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Por cobrar", () => {
    const findReceivable = async (quotationId: number) => {
      const res = await authedRequest(token).get("/receivable/list?limit=100&orderBy=created_at&orderDir=desc");
      expect(res.status).toBe(200);
      return res.body.data.data.find((row: { quotation_id: number }) => row.quotation_id === quotationId);
    };

    it("una cotización pendiente no está por cobrar; aceptada con adelanto, sí, con su saldo", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);
      expect(await findReceivable(quotationId)).toBeUndefined();

      await api.put(`/quotation/status/${quotationId}`, { status: "accepted", advance_payment: advance(100) });
      const row = await findReceivable(quotationId);
      expect(row).toBeDefined();
      expect(row.balance).toBe(150);
      expect(row.total_paid).toBe(100);
      expect(row.last_paid_at).toBe("2026-10-18");
    });

    it("al pagar el saldo completo deja de estar por cobrar", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);
      await api.put(`/quotation/status/${quotationId}`, { status: "accepted", advance_payment: advance(100) });

      const paid = await api.post(`/quotation/${quotationId}/payments`, advance(150));
      expect(paid.status).toBe(201);
      expect(await findReceivable(quotationId)).toBeUndefined();
    });

    it("el resumen suma los saldos de todo lo filtrado", async () => {
      const res = await authedRequest(token).get("/receivable/list?limit=1");
      const { summary, meta } = res.body.data;
      expect(summary.quotation_count).toBe(meta.total);
      expect(summary.total_balance).toBeGreaterThan(0);
    });
  });

  describe("Recordatorios", () => {
    it("uno futuro queda programado y no aparece en la campana", async () => {
      const api = authedRequest(token);
      const { date, time } = limaParts(120);
      const res = await api.post("/reminder/create", { title: "Futuro", remind_date: date, remind_time: time });
      expect(res.status).toBe(201);
      expect(res.body.data.state).toBe("upcoming");
      expect(res.body.data.remind_date).toBe(date);
      expect(res.body.data.remind_time).toBe(time);

      const due = await api.get("/reminder/due");
      expect(due.body.data.data.some((row: { id: number }) => row.id === res.body.data.id)).toBe(false);
    });

    it("al llegar su hora aparece en la campana y al marcarlo visto desaparece", async () => {
      const api = authedRequest(token);
      const { date, time } = limaParts(0);
      const created = await api.post("/reminder/create", { title: "Ahora", remind_date: date, remind_time: time });
      const reminderId: number = created.body.data.id;

      const due = await api.get("/reminder/due");
      expect(due.body.data.data.some((row: { id: number }) => row.id === reminderId)).toBe(true);

      const read = await api.put(`/reminder/read/${reminderId}`);
      expect(read.status).toBe(200);
      expect(read.body.data.state).toBe("read");

      const dueAfter = await api.get("/reminder/due");
      expect(dueAfter.body.data.data.some((row: { id: number }) => row.id === reminderId)).toBe(false);
    });

    it("se le puede recordar algo a otro usuario de la empresa, y solo él lo marca visto", async () => {
      const api = authedRequest(token);
      const gestor = await login(QA_GESTOR.email, QA_GESTOR.password);

      const recipients = await api.get("/reminder/recipients");
      expect(recipients.body.data.find((row: { is_me: boolean }) => row.is_me)?.id).toBe(userId);
      expect(recipients.body.data.some((row: { id: number }) => row.id === gestor.userId)).toBe(true);

      const { date, time } = limaParts(0);
      const created = await api.post("/reminder/create", {
        title: "Cobrar adelanto",
        message: "COT pendiente",
        remind_date: date,
        remind_time: time,
        recipient_user_id: gestor.userId,
      });
      expect(created.status).toBe(201);
      const reminderId: number = created.body.data.id;

      const gestorApi = authedRequest(gestor.token);
      const gestorDue = await gestorApi.get("/reminder/due");
      const item = gestorDue.body.data.data.find((row: { id: number }) => row.id === reminderId);
      expect(item?.creator.id).toBe(userId);

      // Quien lo creó no puede marcarlo visto por el destinatario...
      expect((await api.put(`/reminder/read/${reminderId}`)).status).toBe(403);
      // ...y el destinatario no puede editarlo ni cancelarlo.
      expect((await gestorApi.put(`/reminder/disable/${reminderId}`)).status).toBe(403);
      expect((await gestorApi.put(`/reminder/read/${reminderId}`)).status).toBe(200);

      const sent = await api.get("/reminder/list?box=sent&status=read");
      expect(sent.body.data.data.some((row: { id: number }) => row.id === reminderId)).toBe(true);
    });

    it("no deja avisarle a un usuario de otra empresa", async () => {
      const superadmin = await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password);
      const { date, time } = limaParts(60);
      const res = await authedRequest(token).post("/reminder/create", {
        title: "Ajeno",
        remind_date: date,
        remind_time: time,
        recipient_user_id: superadmin.userId,
      });
      expect(res.status).toBe(400);
    });

    it("no deja programar en el pasado", async () => {
      const res = await authedRequest(token).post("/reminder/create", {
        title: "Pasado",
        remind_date: "2020-01-01",
        remind_time: "10:00",
      });
      expect(res.status).toBe(400);
    });

    it("quien lo creó lo edita y lo cancela; cancelado no aparece en la campana", async () => {
      const api = authedRequest(token);
      const { date, time } = limaParts(30);
      const created = await api.post("/reminder/create", { title: "Editar", remind_date: date, remind_time: time });
      const reminderId: number = created.body.data.id;

      const now = limaParts(0);
      const edited = await api.put(`/reminder/update/${reminderId}`, {
        title: "Editado",
        remind_date: now.date,
        remind_time: now.time,
      });
      expect(edited.status).toBe(200);
      expect(edited.body.data.title).toBe("Editado");
      expect(edited.body.data.state).toBe("due");

      const cancelled = await api.put(`/reminder/disable/${reminderId}`);
      expect(cancelled.body.data.state).toBe("cancelled");
      const due = await api.get("/reminder/due");
      expect(due.body.data.data.some((row: { id: number }) => row.id === reminderId)).toBe(false);

      const cancelledList = await api.get("/reminder/list?box=sent&status=cancelled");
      expect(cancelledList.body.data.data.some((row: { id: number }) => row.id === reminderId)).toBe(true);
    });
  });
});
