"use strict";

// Recurso RBAC de "Subir foto de producto" (POST /product/image). Se otorga a
// todo rol que ya puede crear o editar productos: subir la foto es parte de
// esa misma tarea. Igual solo funciona si la empresa tiene habilitadas las
// fotos de productos (lo decide el Super Administrador en Empresas).
//
// Módulo, vista padre y roles se resuelven por CÓDIGO (nunca ids
// hardcodeados). Idempotente: correrlo dos veces no duplica nada.
const now = new Date();

const PREFERRED_ID = 226;
const MODULE_CODE = "producto";
const PARENT_CODE = "producto.list";
const CODE = "producto.image.upload.button";
const GRANT_LIKE_CODES = ["producto.create.button", "producto.update.button"];

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, {
    replacements: [code],
  });
  return rows[0]?.id ?? null;
};

module.exports = {
  async up(queryInterface) {
    const moduleId = await findIdByCode(queryInterface, "modules", MODULE_CODE);
    // Base que nunca sembró el módulo de productos: no hay dónde colgarlo.
    if (!moduleId) return;

    if (!(await findIdByCode(queryInterface, "resources", CODE))) {
      const parentId = await findIdByCode(queryInterface, "resources", PARENT_CODE);
      // Si en esa base el id preferido ya está tomado, la base asigna otro.
      const [taken] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", {
        replacements: [PREFERRED_ID],
      });
      const row = {
        module_id: moduleId,
        parent_id: parentId,
        type: "button",
        code: CODE,
        name: "Subir foto de producto",
        description: null,
        route: "/product/image",
        verb: "POST",
        icon: null,
        show_in_menu: false,
        position: PREFERRED_ID,
        active: true,
        created_at: now,
      };
      await queryInterface.bulkInsert("resources", [taken.length > 0 ? row : { id: PREFERRED_ID, ...row }]);
    }

    const resourceId = await findIdByCode(queryInterface, "resources", CODE);
    await queryInterface.sequelize.query(
      `INSERT INTO roles_resources (role_id, resource_id, created_at)
       SELECT DISTINCT rr.role_id, :resourceId, NOW()
       FROM roles_resources rr
       INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code IN (:grantLikeCodes)
       WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
      { replacements: { resourceId, grantLikeCodes: GRANT_LIKE_CODES } }
    );
  },

  async down(queryInterface) {
    const resourceId = await findIdByCode(queryInterface, "resources", CODE);
    if (!resourceId) return;
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceId });
    await queryInterface.bulkDelete("resources", { id: resourceId });
  },
};
