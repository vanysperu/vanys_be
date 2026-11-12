"use strict";

// Recurso RBAC de POST /user/:id/password-link (Sprint 2, ítem 4): "Reenviar
// invitación" y "Enviar enlace para restablecer" en Usuarios. Lo recibe todo
// rol que ya puede editar usuarios (users.update.button). Se resuelve por
// CÓDIGO (el id es solo preferido). Idempotente.
const now = new Date();

const PREFERRED_ID = 264;
const MODULE_CODE = "users";
const VIEW_CODE = "users.list";
const CODE = "users.passwordLink.button";
const LIKE_CODES = ["users.update.button"];

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, { replacements: [code] });
  return rows[0]?.id ?? null;
};

module.exports = {
  async up(queryInterface) {
    const moduleId = await findIdByCode(queryInterface, "modules", MODULE_CODE);
    if (!moduleId) return;

    if (!(await findIdByCode(queryInterface, "resources", CODE))) {
      const [taken] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", { replacements: [PREFERRED_ID] });
      const row = {
        module_id: moduleId,
        parent_id: await findIdByCode(queryInterface, "resources", VIEW_CODE),
        type: "button",
        code: CODE,
        name: "Enviar enlace de contraseña (invitación o restablecer)",
        description: null,
        route: "/user/*/password-link",
        verb: "POST",
        icon: null,
        show_in_menu: false,
        position: PREFERRED_ID,
        active: true,
        created_at: now,
      };
      await queryInterface.bulkInsert("resources", [taken.length > 0 ? row : { id: PREFERRED_ID, ...row }]);
    }

    await queryInterface.sequelize.query(
      `INSERT INTO roles_resources (role_id, resource_id, created_at)
       SELECT DISTINCT rr.role_id, :resourceId, NOW()
       FROM roles_resources rr
       INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code IN (:likeCodes)
       WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
      { replacements: { resourceId: await findIdByCode(queryInterface, "resources", CODE), likeCodes: LIKE_CODES } }
    );
  },

  async down(queryInterface) {
    const resourceId = await findIdByCode(queryInterface, "resources", CODE);
    if (!resourceId) return;
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceId });
    await queryInterface.bulkDelete("resources", { id: resourceId });
  },
};
