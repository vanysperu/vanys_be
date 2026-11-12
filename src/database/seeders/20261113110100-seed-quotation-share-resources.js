"use strict";

// Recursos RBAC de "Compartir la cotización" (Sprint 2, ítem 7). Se resuelven
// por CÓDIGO (el id es solo preferido). Idempotente.
//
// - Ver el enlace, mandar por WhatsApp y por correo: quien ya puede ver el PDF
//   de la cotización (cotizacion.pdf.endpoint), Gestor incluido.
// - Prender/apagar el enlace y generar uno nuevo: quien puede editar
//   cotizaciones (cotizacion.update.button).
const now = new Date();
const MODULE_CODE = "cotizacion";
const VIEW_CODE = "cotizacion.list";

const RESOURCES = [
  {
    id: 265,
    type: "endpoint",
    code: "cotizacion.publicLink.endpoint",
    name: "Ver el enlace para compartir (API)",
    route: "/quotation/*/public-link",
    verb: "GET",
    likeCodes: ["cotizacion.pdf.endpoint"],
  },
  {
    id: 266,
    type: "button",
    code: "cotizacion.share.whatsapp.button",
    name: "Enviar por WhatsApp",
    route: "/quotation/*/share/whatsapp",
    verb: "POST",
    likeCodes: ["cotizacion.pdf.endpoint"],
  },
  {
    id: 267,
    type: "button",
    code: "cotizacion.share.email.button",
    name: "Enviar por correo",
    route: "/quotation/*/share/email",
    verb: "POST",
    likeCodes: ["cotizacion.pdf.endpoint"],
  },
  {
    id: 268,
    type: "button",
    code: "cotizacion.publicLink.toggle.button",
    name: "Visible para el cliente (prender/apagar el enlace)",
    route: "/quotation/*/public-link",
    verb: "PUT",
    likeCodes: ["cotizacion.update.button"],
  },
  {
    id: 269,
    type: "button",
    code: "cotizacion.publicLink.regenerate.button",
    name: "Generar enlace nuevo",
    route: "/quotation/*/public-link/regenerate",
    verb: "POST",
    likeCodes: ["cotizacion.update.button"],
  },
];

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, { replacements: [code] });
  return rows[0]?.id ?? null;
};

module.exports = {
  async up(queryInterface) {
    const moduleId = await findIdByCode(queryInterface, "modules", MODULE_CODE);
    if (!moduleId) return;
    const parentId = await findIdByCode(queryInterface, "resources", VIEW_CODE);

    for (const resource of RESOURCES) {
      if (!(await findIdByCode(queryInterface, "resources", resource.code))) {
        const [taken] = await queryInterface.sequelize.query("SELECT 1 FROM resources WHERE id = ?", { replacements: [resource.id] });
        const row = {
          module_id: moduleId,
          parent_id: parentId,
          type: resource.type,
          code: resource.code,
          name: resource.name,
          description: null,
          route: resource.route,
          verb: resource.verb,
          icon: null,
          show_in_menu: false,
          position: resource.id,
          active: true,
          created_at: now,
        };
        await queryInterface.bulkInsert("resources", [taken.length > 0 ? row : { id: resource.id, ...row }]);
      }

      await queryInterface.sequelize.query(
        `INSERT INTO roles_resources (role_id, resource_id, created_at)
         SELECT DISTINCT rr.role_id, :resourceId, NOW()
         FROM roles_resources rr
         INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code IN (:likeCodes)
         WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
        {
          replacements: {
            resourceId: await findIdByCode(queryInterface, "resources", resource.code),
            likeCodes: resource.likeCodes,
          },
        }
      );
    }
  },

  async down(queryInterface) {
    for (const resource of RESOURCES) {
      const resourceId = await findIdByCode(queryInterface, "resources", resource.code);
      if (!resourceId) continue;
      await queryInterface.bulkDelete("roles_resources", { resource_id: resourceId });
      await queryInterface.bulkDelete("resources", { id: resourceId });
    }
  },
};
