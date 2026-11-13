"use strict";

// Sprint 2, ítem 3 (compras sin factura): recursos RBAC de la bandeja
// "Compras sin factura", registrar/vincular una factura para varias compras,
// quitar una compra de una factura y completar sus datos.
//
// Los recibe quien registra compras (Gestor incluido: el plan pide que el
// Gestor resuelva sus compras pendientes desde la bandeja) y los roles
// administradores. Por eso quien registra compras recibe también la vista
// Facturas y su listado: siempre limitados a su tienda por el backend.
// Se resuelve por CÓDIGO (los ids son solo preferidos). Idempotente.
const now = new Date();

const MODULE_CODE = "invoice";
const VIEW_CODE = "invoice.list";
const LINK_LIKE = ["payment.update.button", "purchase_order.item.registerPurchase.button"];

// [id preferido, type, code, name, route, verb]
const NEW_RESOURCES = [
  [315, "endpoint", "invoice.pendingPurchases.endpoint", "Compras sin factura (API)", "/invoice/pending-purchases", "GET"],
  [316, "button", "invoice.link.button", "Vincular factura a compras", "/invoice/link-purchases", "POST"],
  [317, "button", "invoice.removePurchase.button", "Quitar compra de una factura", "/invoice/*/remove-purchase", "PUT"],
  [318, "button", "invoice.details.button", "Datos de la factura de compra", "/invoice/*/details", "PUT"],
];
// Recursos que ya existían y ahora recibe también quien registra compras.
const EXISTING_TO_GRANT = [VIEW_CODE, "invoice.list.endpoint"];

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, { replacements: [code] });
  return rows[0]?.id ?? null;
};

const grantLike = (queryInterface, resourceId) =>
  queryInterface.sequelize.query(
    `INSERT INTO roles_resources (role_id, resource_id, created_at)
     SELECT DISTINCT rr.role_id, :resourceId, NOW()
     FROM roles_resources rr
     INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code IN (:likeCodes)
     WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
    { replacements: { resourceId, likeCodes: LINK_LIKE } }
  );

module.exports = {
  async up(queryInterface) {
    const moduleId = await findIdByCode(queryInterface, "modules", MODULE_CODE);
    // Base sin el módulo de facturas: no hay dónde colgar los recursos.
    if (!moduleId) return;
    const parentId = await findIdByCode(queryInterface, "resources", VIEW_CODE);

    for (const [preferredId, type, code, name, route, verb] of NEW_RESOURCES) {
      if (!(await findIdByCode(queryInterface, "resources", code))) {
        const [taken] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", { replacements: [preferredId] });
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
        await queryInterface.bulkInsert("resources", [taken.length > 0 ? row : { id: preferredId, ...row }]);
      }
      await grantLike(queryInterface, await findIdByCode(queryInterface, "resources", code));
    }

    for (const code of EXISTING_TO_GRANT) {
      const resourceId = await findIdByCode(queryInterface, "resources", code);
      if (resourceId) await grantLike(queryInterface, resourceId);
    }
  },

  async down(queryInterface) {
    for (const [, , code] of NEW_RESOURCES) {
      const resourceId = await findIdByCode(queryInterface, "resources", code);
      if (!resourceId) continue;
      await queryInterface.bulkDelete("roles_resources", { resource_id: resourceId });
      await queryInterface.bulkDelete("resources", { id: resourceId });
    }
    // La vista Facturas vuelve a ser solo de los roles administradores: se
    // quita a los roles que registran compras pero no tienen payment.update.button.
    // (MySQL no deja borrar de roles_resources con una subconsulta sobre la misma tabla.)
    const [adminRows] = await queryInterface.sequelize.query(
      `SELECT DISTINCT rr.role_id FROM roles_resources rr
       INNER JOIN resources res ON res.id = rr.resource_id AND res.code = 'payment.update.button'`
    );
    const adminRoleIds = adminRows.map((row) => row.role_id);
    for (const code of EXISTING_TO_GRANT) {
      const resourceId = await findIdByCode(queryInterface, "resources", code);
      if (!resourceId) continue;
      await queryInterface.sequelize.query(
        `DELETE FROM roles_resources WHERE resource_id = :resourceId ${adminRoleIds.length > 0 ? "AND role_id NOT IN (:adminRoleIds)" : ""}`,
        { replacements: { resourceId, adminRoleIds } }
      );
    }
  },
};
