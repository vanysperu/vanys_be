"use strict";

// Las cotizaciones de la data de demo se crearon antes de que
// createQuotation asignara una etapa por defecto a cada item (y antes de
// que las etapas se modelaran en general_variable) — sus items quedaron
// con stage_id NULL, por eso no aparecían en ninguna columna del
// mini-kanban. Se les asigna la primera etapa (menor ref2) disponible para
// la empresa de cada cotización (global o propia), igual que hace
// createQuotation con una cotización nueva.
module.exports = {
  async up(queryInterface) {
    const [orphanItems] = await queryInterface.sequelize.query(`
      SELECT qi.id AS item_id, q.company_id
      FROM quotation_item qi
      JOIN quotation q ON q.id = qi.quotation_id
      WHERE qi.stage_id IS NULL
    `);

    if (orphanItems.length === 0) return;

    const companyIds = [...new Set(orphanItems.map((row) => row.company_id))];
    const [stageRows] = await queryInterface.sequelize.query(
      `SELECT id, company_id, ref2 FROM general_variable
       WHERE category = 'production_stage' AND (company_id IS NULL OR company_id IN (:companyIds))`,
      { replacements: { companyIds } },
    );

    const firstStageByCompany = new Map();
    for (const companyId of companyIds) {
      const candidates = stageRows.filter((row) => row.company_id === companyId || row.company_id === null);
      const first = candidates.sort((a, b) => Number(a.ref2 ?? 0) - Number(b.ref2 ?? 0))[0];
      if (first) firstStageByCompany.set(companyId, first.id);
    }

    for (const item of orphanItems) {
      const stageId = firstStageByCompany.get(item.company_id);
      if (!stageId) continue;
      await queryInterface.sequelize.query(`UPDATE quotation_item SET stage_id = :stageId WHERE id = :itemId`, {
        replacements: { stageId, itemId: item.item_id },
      });
    }
  },

  async down(queryInterface) {
    // No reversible de forma segura (no se guarda el estado previo NULL
    // por fila) — un rollback real requeriría un respaldo aparte.
  },
};
