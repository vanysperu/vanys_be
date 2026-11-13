"use strict";

const { constraintExists, tableExists } = require("../migration-helpers");

// Sprint 2, ítem 5 (pedido explícito del usuario): "que los estados del kanban
// de productos dentro de cotización uno pueda personalizar qué columnas quiere
// y el orden de flujo". Decisiones D10 (modos Lineal y Libre) y D11 (por empresa).
//
// Antes las etapas eran filas de general_variable (category = production_stage):
// 4 globales + las que agregara cada empresa, sin poder ocultar ni reordenar las
// globales. Ahora cada empresa tiene las suyas:
//
//   production_workflow         configuración por empresa: modo de avance
//                               (linear = solo a la vecina, como antes; free =
//                               a cualquier columna) y si se puede retroceder.
//   production_workflow_stage   columnas de la empresa, en orden, con su tipo
//                               (todo / doing / done, como las categorías de
//                               estado de Jira: así las estadísticas funcionan
//                               aunque cada empresa nombre sus columnas como quiera).
//   quotation_item_stage_log    cada movimiento de un producto (desde, hacia,
//                               quién y cuándo): tiempo en cada etapa.
//
// Migración de datos: en cada empresa se copian las etapas que veía (globales +
// propias, incluidas las dadas de baja como inactivas) en su mismo orden, cada
// producto pasa a la etapa nueva equivalente y la FK de quotation_item.stage_id
// apunta a la tabla nueva. Las filas viejas de general_variable se dan de baja:
// ya no se usan (editar ahí no cambiaría nada y confundiría).
//
// OJO: no se reutiliza el nombre `production_stage`: la migración vieja
// 20260920100000 tiene `DROP TABLE production_stage` en su down.
const DEFAULT_COLOR = "#64748B";
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const AUDIT = `
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NULL,
      updated_at DATETIME NULL`;

const CREATE_WORKFLOW = `
    CREATE TABLE production_workflow (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      flow_mode ENUM('linear', 'free') NOT NULL DEFAULT 'linear',
      allow_backward BOOLEAN NOT NULL DEFAULT TRUE,${AUDIT},
      PRIMARY KEY (id),
      UNIQUE KEY uq_production_workflow_company (company_id),
      CONSTRAINT fk_production_workflow_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`;

const CREATE_STAGE = `
    CREATE TABLE production_workflow_stage (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      name VARCHAR(60) NOT NULL,
      color CHAR(7) NOT NULL,
      position INT NOT NULL,
      category ENUM('todo', 'doing', 'done') NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      legacy_variable_id BIGINT NULL,${AUDIT},
      PRIMARY KEY (id),
      KEY idx_production_workflow_stage_company (company_id, active, position),
      CONSTRAINT fk_production_workflow_stage_company_id FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`;

const CREATE_LOG = `
    CREATE TABLE quotation_item_stage_log (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      quotation_id BIGINT NOT NULL,
      quotation_item_id BIGINT NOT NULL,
      from_stage_id BIGINT NULL,
      to_stage_id BIGINT NOT NULL,${AUDIT},
      PRIMARY KEY (id),
      KEY idx_item_stage_log_item (quotation_item_id, created_at),
      KEY idx_item_stage_log_company (company_id, created_at),
      CONSTRAINT fk_item_stage_log_item_id FOREIGN KEY (quotation_item_id) REFERENCES quotation_item (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_item_stage_log_to_stage FOREIGN KEY (to_stage_id) REFERENCES production_workflow_stage (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`;

// Primera columna "por hacer", última "terminado", el resto "en curso".
const categoryAt = (index, total) => {
  if (index === total - 1 && total > 1) return "done";
  if (index === 0) return "todo";
  return "doing";
};

module.exports = {
  async up(queryInterface) {
    if (!(await tableExists(queryInterface, "production_workflow"))) {
      await queryInterface.sequelize.query(CREATE_WORKFLOW);
    }
    if (!(await tableExists(queryInterface, "production_workflow_stage"))) {
      await queryInterface.sequelize.query(CREATE_STAGE);
    }
    if (!(await tableExists(queryInterface, "quotation_item_stage_log"))) {
      await queryInterface.sequelize.query(CREATE_LOG);
    }

    // Ya migrado (la FK vieja no existe): nada más que hacer.
    if (!(await constraintExists(queryInterface, "quotation_item", "fk_quotation_item_stage_id_general_variable"))) return;

    const now = new Date();
    const [variables] = await queryInterface.sequelize.query(
      `SELECT id, company_id, name, ref1, ref2, is_deleted FROM general_variable
       WHERE category = 'production_stage'
       ORDER BY CAST(ref2 AS SIGNED), id`
    );
    const globals = variables.filter((row) => row.company_id === null);
    const [companies] = await queryInterface.sequelize.query("SELECT id FROM company");
    const [alreadyMigrated] = await queryInterface.sequelize.query("SELECT DISTINCT company_id FROM production_workflow_stage");
    const migrated = new Set(alreadyMigrated.map((row) => Number(row.company_id)));

    for (const company of companies) {
      const companyId = Number(company.id);
      await queryInterface.sequelize.query(
        `INSERT IGNORE INTO production_workflow (company_id, flow_mode, allow_backward, created_at, updated_at)
         VALUES (?, 'linear', TRUE, ?, ?)`,
        { replacements: [companyId, now, now] }
      );
      if (migrated.has(companyId)) continue;

      const own = variables.filter((row) => Number(row.company_id) === companyId);
      const stages = [...globals, ...own].sort(
        (a, b) => Number(a.ref2 ?? 0) - Number(b.ref2 ?? 0) || Number(a.id) - Number(b.id)
      );
      if (stages.length === 0) continue;

      await queryInterface.bulkInsert(
        "production_workflow_stage",
        stages.map((row, index) => ({
          company_id: companyId,
          name: String(row.name ?? "Etapa").slice(0, 60),
          color: HEX_COLOR.test(row.ref1 ?? "") ? row.ref1 : DEFAULT_COLOR,
          position: index,
          category: categoryAt(index, stages.length),
          active: !row.is_deleted,
          legacy_variable_id: row.id,
          created_by: null,
          created_at: now,
          updated_by: null,
          updated_at: now,
        }))
      );
    }

    await queryInterface.removeConstraint("quotation_item", "fk_quotation_item_stage_id_general_variable");

    // Cada producto pasa a la etapa nueva de SU empresa que reemplaza a la vieja.
    await queryInterface.sequelize.query(
      `UPDATE quotation_item qi
       INNER JOIN quotation q ON q.id = qi.quotation_id
       LEFT JOIN production_workflow_stage s ON s.company_id = q.company_id AND s.legacy_variable_id = qi.stage_id
       SET qi.stage_id = s.id
       WHERE qi.stage_id IS NOT NULL`
    );

    await queryInterface.addConstraint("quotation_item", {
      fields: ["stage_id"],
      type: "foreign key",
      name: "fk_quotation_item_stage_id_workflow_stage",
      references: { table: "production_workflow_stage", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.sequelize.query(
      "UPDATE general_variable SET is_deleted = TRUE, updated_at = ? WHERE category = 'production_stage' AND is_deleted = FALSE",
      { replacements: [now] }
    );
  },

  async down(queryInterface) {
    if (await constraintExists(queryInterface, "quotation_item", "fk_quotation_item_stage_id_workflow_stage")) {
      await queryInterface.removeConstraint("quotation_item", "fk_quotation_item_stage_id_workflow_stage");
      // Vuelve a la etapa vieja equivalente (las creadas después se pierden).
      await queryInterface.sequelize.query(
        `UPDATE quotation_item qi
         LEFT JOIN production_workflow_stage s ON s.id = qi.stage_id
         SET qi.stage_id = s.legacy_variable_id
         WHERE qi.stage_id IS NOT NULL`
      );
      await queryInterface.sequelize.query(
        `UPDATE general_variable gv
         INNER JOIN (SELECT DISTINCT legacy_variable_id FROM production_workflow_stage WHERE active = TRUE) s
           ON s.legacy_variable_id = gv.id
         SET gv.is_deleted = FALSE`
      );
      await queryInterface.addConstraint("quotation_item", {
        fields: ["stage_id"],
        type: "foreign key",
        name: "fk_quotation_item_stage_id_general_variable",
        references: { table: "general_variable", field: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
    }
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS quotation_item_stage_log");
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS production_workflow_stage");
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS production_workflow");
  },
};
