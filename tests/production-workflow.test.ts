import { authedRequest, login } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, createQuotationFixture, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

interface StageRow {
  id: number;
  name: string;
  color: string;
  position: number;
  category: "todo" | "doing" | "done";
  active: boolean;
  itemCount?: number;
}

interface StageInput {
  id?: number | null;
  name: string;
  color: string;
  category: StageRow["category"];
  active: boolean;
  moveItemsToStageId?: number | null;
}

const asInput = (stage: StageRow): StageInput => ({
  id: stage.id,
  name: stage.name,
  color: stage.color,
  category: stage.category,
  active: stage.active,
});

/**
 * Sprint 2, ítem 5 (pedido explícito del usuario): "que los estados del kanban
 * de productos dentro de cotización uno pueda personalizar qué columnas quiere
 * y el orden de flujo". Cada empresa tiene sus columnas (D11) y elige modo
 * lineal o libre (D10). Se usa una empresa DESECHABLE: cambiar el flujo de
 * "Acme Corp QA" rompería las suites que mueven productos en modo lineal.
 */
describe("Flujo de producción configurable por empresa", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let stages: StageRow[];

  const admin = () => authedRequest(ctx.admin.token);
  const getConfig = async () => {
    const res = await admin().get("/production-workflow/config");
    expect(res.status).toBe(200);
    return res.body.data as { companyId: number; flowMode: string; allowBackward: boolean; stages: StageRow[] };
  };
  const save = (body: { flowMode: "linear" | "free"; allowBackward: boolean; stages: StageInput[] }) =>
    admin().put("/production-workflow/config", body);
  const move = (itemId: number, stageId: number | undefined) => admin().put(`/quotation/item/${itemId}/stage`, { stage_id: stageId });
  const stageOf = async (quotationId: number) => {
    const detail = await admin().get(`/quotation/find/${quotationId}`);
    return detail.body.data.items[0].stage_id as number | null;
  };
  const logsOf = (itemId: number) =>
    queryRows<{ from_stage_id: number | null; to_stage_id: number; created_by: number }>(
      "SELECT from_stage_id, to_stage_id, created_by FROM quotation_item_stage_log WHERE quotation_item_id = ? ORDER BY id",
      [itemId]
    );

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
  }, 60_000);

  it("una empresa nueva nace con las 4 columnas de siempre, en modo lineal", async () => {
    const config = await getConfig();
    expect(config.companyId).toBe(ctx.companyId);
    expect(config.flowMode).toBe("linear");
    expect(config.allowBackward).toBe(true);
    expect(config.stages.map((stage) => [stage.name, stage.category, stage.active, stage.itemCount])).toEqual([
      ["Diseño", "todo", true, 0],
      ["Insumos", "doing", true, 0],
      ["Producción", "doing", true, 0],
      ["Listo", "done", true, 0],
    ]);
    stages = config.stages;

    const board = await admin().get("/production-workflow/board");
    expect(board.status).toBe(200);
    expect((board.body.data.stages as StageRow[]).map((stage) => stage.id)).toEqual(stages.map((stage) => stage.id));
  });

  it("modo lineal: el producto entra por la primera columna, avanza de a una, retrocede y deja historial", async () => {
    const { quotationId, quotationItemId } = await createQuotationFixture(ctx.admin.token, ctx.companyId);
    const [first, second, third] = stages;
    expect(await stageOf(quotationId)).toBe(first?.id);

    const skip = await move(quotationItemId, third?.id);
    expect(skip.status).toBe(400);
    expect(skip.body.message).toMatch(/saltar/);

    expect((await move(quotationItemId, second?.id)).status).toBe(200);
    expect((await move(quotationItemId, first?.id)).status).toBe(200);
    expect(await stageOf(quotationId)).toBe(first?.id);

    const logs = await logsOf(quotationItemId);
    expect(logs.map((log) => [log.from_stage_id, log.to_stage_id])).toEqual([
      [first?.id, second?.id],
      [second?.id, first?.id],
    ]);
    expect(logs.every((log) => Number(log.created_by) === ctx.admin.userId)).toBe(true);
  });

  it("modo lineal sin retroceso: no deja volver a la columna anterior", async () => {
    const saved = await save({ flowMode: "linear", allowBackward: false, stages: stages.map(asInput) });
    expect(saved.status).toBe(200);

    const { quotationItemId } = await createQuotationFixture(ctx.admin.token, ctx.companyId);
    expect((await move(quotationItemId, stages[1]?.id)).status).toBe(200);
    const back = await move(quotationItemId, stages[0]?.id);
    expect(back.status).toBe(400);
    expect(back.body.message).toMatch(/retroceder/);
  });

  it("reordena, renombra y agrega columnas; en modo libre se puede saltar", async () => {
    const [first, second, third, last] = stages as [StageRow, StageRow, StageRow, StageRow];
    const saved = await save({
      flowMode: "free",
      allowBackward: true,
      stages: [
        asInput(first),
        { ...asInput(third), name: "Taller" },
        asInput(second),
        { name: "Control de calidad", color: "#0f766e", category: "doing", active: true },
        asInput(last),
      ],
    });
    expect(saved.status).toBe(200);
    const config = saved.body.data as { flowMode: string; stages: StageRow[] };
    expect(config.flowMode).toBe("free");
    expect(config.stages.map((stage) => stage.name)).toEqual(["Diseño", "Taller", "Insumos", "Control de calidad", "Listo"]);
    // El color se guarda normalizado en mayúsculas.
    expect(config.stages[3]?.color).toBe("#0F766E");
    stages = config.stages;

    const { quotationId, quotationItemId } = await createQuotationFixture(ctx.admin.token, ctx.companyId);
    expect((await move(quotationItemId, stages[4]?.id)).status).toBe(200);
    expect(await stageOf(quotationId)).toBe(stages[4]?.id);
  });

  it("desactivar una columna con productos exige elegir a dónde pasan, y los mueve con historial", async () => {
    const { quotationId, quotationItemId } = await createQuotationFixture(ctx.admin.token, ctx.companyId);
    const quality = stages[3] as StageRow;
    expect((await move(quotationItemId, quality.id)).status).toBe(200);

    const withoutTarget = stages.map((stage) => (stage.id === quality.id ? { ...asInput(stage), active: false } : asInput(stage)));
    const refused = await save({ flowMode: "free", allowBackward: true, stages: withoutTarget });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/Control de calidad/);
    expect(await stageOf(quotationId)).toBe(quality.id);

    const target = stages[4] as StageRow;
    const withTarget = stages.map((stage) =>
      stage.id === quality.id ? { ...asInput(stage), active: false, moveItemsToStageId: target.id } : asInput(stage)
    );
    const saved = await save({ flowMode: "free", allowBackward: true, stages: withTarget });
    expect(saved.status).toBe(200);
    expect(await stageOf(quotationId)).toBe(target.id);

    const lastLog = (await logsOf(quotationItemId)).at(-1);
    expect([lastLog?.from_stage_id, lastLog?.to_stage_id]).toEqual([quality.id, target.id]);

    // Desactivada: ya no está en el tablero ni acepta productos.
    const board = await admin().get("/production-workflow/board");
    expect((board.body.data.stages as StageRow[]).some((stage) => stage.id === quality.id)).toBe(false);
    expect((await move(quotationItemId, quality.id)).status).toBe(400);
    stages = (saved.body.data as { stages: StageRow[] }).stages;
  });

  it("rechaza configuraciones inválidas sin tocar nada", async () => {
    const before = await getConfig();
    const base = before.stages.map(asInput);

    // Las columnas no se borran: se desactivan.
    expect((await save({ flowMode: "free", allowBackward: true, stages: base.slice(1) })).status).toBe(400);
    // Sin columnas activas.
    expect((await save({ flowMode: "free", allowBackward: true, stages: base.map((stage) => ({ ...stage, active: false })) })).status).toBe(400);
    // Dos activas con el mismo nombre (sin importar mayúsculas).
    const duplicated = base.map((stage, index) => (index === 1 ? { ...stage, name: (base[0]?.name ?? "").toUpperCase() } : stage));
    expect((await save({ flowMode: "free", allowBackward: true, stages: duplicated })).status).toBe(400);
    // Color o tipo inválido (validador).
    const badColor = base.map((stage, index) => (index === 0 ? { ...stage, color: "rojo" } : stage));
    expect((await save({ flowMode: "free", allowBackward: true, stages: badColor })).status).toBe(400);

    // Una columna de OTRA empresa no se puede colar en este flujo.
    const [foreignStage] = await queryRows<{ id: number }>(
      "SELECT id FROM production_workflow_stage WHERE company_id <> ? ORDER BY id LIMIT 1",
      [ctx.companyId]
    );
    const foreignId = Number(foreignStage?.id);
    const foreign = await save({
      flowMode: "free",
      allowBackward: true,
      stages: [...base, { id: foreignId, name: "Ajena", color: "#000000", category: "doing", active: true }],
    });
    expect(foreign.status).toBe(400);

    const after = await getConfig();
    expect(after).toEqual(before);
  });

  it("el Gestor ve el tablero pero no la configuración; el Super Administrador elige la empresa", async () => {
    const gestor = authedRequest(ctx.gestor.token);
    expect((await gestor.get("/production-workflow/board")).status).toBe(200);
    expect((await gestor.get("/production-workflow/config")).status).toBe(403);
    expect((await gestor.put("/production-workflow/config", {})).status).toBe(403);

    const superApi = authedRequest(superToken);
    expect((await superApi.get("/production-workflow/config")).status).toBe(400);
    const chosen = await superApi.get(`/production-workflow/config?companyId=${ctx.companyId}`);
    expect(chosen.status).toBe(200);
    expect(chosen.body.data.companyId).toBe(ctx.companyId);
  });
});
