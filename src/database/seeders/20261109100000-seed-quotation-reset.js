"use strict";

// Recursos RBAC de "Resetear cotización" (PUT /quotation/:id/reset y su vista
// previa). Exclusivo del Super Administrador (pedido explícito del usuario): no
// se otorgan a ningún rol y las rutas exigen requireSystemRole.
//
// Se resuelve por CÓDIGO (los ids son solo preferidos). Idempotente.
const now = new Date();

const MODULE_CODE = "cotizacion";
const VIEW_CODE = "cotizacion.list";

// [id preferido, type, code, name, route, verb]
const resourceRows = [
  [247, "button", "cotizacion.reset.button", "Resetear cotización (Super Administrador)", "/quotation/*/reset", "PUT"],
  [248, "endpoint", "cotizacion.resetPreview.endpoint", "Vista previa del reset de cotización (API)", "/quotation/*/reset-preview", "GET"],
];

const codes = resourceRows.map((row) => row[2]);

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, { replacements: [code] });
  return rows[0]?.id ?? null;
};

module.exports = {
  async up(queryInterface) {
    const moduleId = await findIdByCode(queryInterface, "modules", MODULE_CODE);
    // Base sin el módulo de cotizaciones: no hay dónde colgar los recursos.
    if (!moduleId) return;
    const parentId = await findIdByCode(queryInterface, "resources", VIEW_CODE);

    for (const [preferredId, type, code, name, route, verb] of resourceRows) {
      if (await findIdByCode(queryInterface, "resources", code)) continue;
      const row = {
        module_id: moduleId,
        parent_id: parentId,
        type,
        code,
        name,
        description: null,
        route,
        verb,
        icon: null,
        show_in_menu: false,
        position: preferredId,
        active: true,
        created_at: now,
      };
      const [taken] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", { replacements: [preferredId] });
      await queryInterface.bulkInsert("resources", [taken.length > 0 ? row : { id: preferredId, ...row }]);
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query("SELECT id FROM resources WHERE code IN (:codes)", { replacements: { codes } });
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return;
    await queryInterface.bulkDelete("roles_resources", { resource_id: ids });
    await queryInterface.bulkDelete("resources", { id: ids });
  },
};
