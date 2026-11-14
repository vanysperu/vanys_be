"use strict";

// Módulo "Guías de remisión" (dispatch_guide, Sprint 2 ítem 1, modo manual).
// Tablas en 20261116100000-create-dispatch-guide.js. Además del rol, la
// empresa tiene que tener la funcionalidad "dispatch_guide" (company_feature).
//
// - Operar (ver, armar y editar borradores, registrar el número y el PDF de
//   SUNAT, descartar un borrador, precargar desde una cotización o una
//   transferencia, elegir vehículo/conductor/transportista): quien ya ve
//   cotizaciones (cotizacion.list), Gestor incluido — su alcance queda en su
//   tienda.
// - Configurar los catálogos de vehículos y conductores y anular una guía ya
//   registrada: los roles con producto.create.button (Administrador). Es
//   configuración / corrección: nunca el Gestor (CLAUDE.md §11.1).
//
// Módulos, vistas y roles se resuelven por CÓDIGO (los ids son solo
// preferidos). Idempotente.
const now = new Date();

const MODULE_CODE = "dispatch_guide";
const PREFERRED_MODULE_ID = 27;
// En el menú va en su propio grupo "Logística" (frontend); la posición, después de Inventario.
const AFTER_MODULE_CODE = "inventory";

const OPERATOR_LIKE = ["cotizacion.list"];
const ADMIN_LIKE = ["producto.create.button"];

const GUIDES_VIEW = "dispatch_guide.guides.view";
const VEHICLES_VIEW = "dispatch_guide.vehicles.view";
const DRIVERS_VIEW = "dispatch_guide.drivers.view";

// [id preferido, padre, type, code, name, route, verb, show_in_menu, icon, otorgar como]
const resourceRows = [
  [320, null, "view", GUIDES_VIEW, "Guías de remisión", "/logistica/guias", null, true, "document", OPERATOR_LIKE],
  [321, null, "view", VEHICLES_VIEW, "Vehículos", "/logistica/vehiculos", null, true, "truck", ADMIN_LIKE],
  [322, null, "view", DRIVERS_VIEW, "Conductores", "/logistica/conductores", null, true, "id-card", ADMIN_LIKE],
  [323, GUIDES_VIEW, "endpoint", "dispatch_guide.list.endpoint", "Listar guías (API)", "/dispatch-guide/guides", "GET", false, null, OPERATOR_LIKE],
  [324, GUIDES_VIEW, "endpoint", "dispatch_guide.find.endpoint", "Ver una guía (API)", "/dispatch-guide/guides/*", "GET", false, null, OPERATOR_LIKE],
  [325, GUIDES_VIEW, "button", "dispatch_guide.create.button", "Crear guía", "/dispatch-guide/guides", "POST", false, null, OPERATOR_LIKE],
  [326, GUIDES_VIEW, "button", "dispatch_guide.update.button", "Editar borrador de guía", "/dispatch-guide/guides/*", "PUT", false, null, OPERATOR_LIKE],
  [327, GUIDES_VIEW, "button", "dispatch_guide.register.button", "Registrar guía emitida en SUNAT", "/dispatch-guide/guides/*/register", "POST", false, null, OPERATOR_LIKE],
  [328, GUIDES_VIEW, "button", "dispatch_guide.uploadFile.button", "Subir PDF de la guía", "/dispatch-guide/guides/*/file", "POST", false, null, OPERATOR_LIKE],
  [329, GUIDES_VIEW, "button", "dispatch_guide.downloadFile.button", "Descargar PDF de la guía", "/dispatch-guide/guides/*/file", "GET", false, null, OPERATOR_LIKE],
  [330, GUIDES_VIEW, "button", "dispatch_guide.discard.button", "Descartar borrador de guía", "/dispatch-guide/guides/*/discard", "POST", false, null, OPERATOR_LIKE],
  [331, GUIDES_VIEW, "button", "dispatch_guide.void.button", "Anular guía registrada", "/dispatch-guide/guides/*/void", "POST", false, null, ADMIN_LIKE],
  [332, GUIDES_VIEW, "endpoint", "dispatch_guide.prefill.endpoint", "Precargar guía (API)", "/dispatch-guide/prefill", "GET", false, null, OPERATOR_LIKE],
  [333, GUIDES_VIEW, "endpoint", "dispatch_guide.carriers.endpoint", "Transportistas (API)", "/dispatch-guide/carriers", "GET", false, null, OPERATOR_LIKE],
  [334, VEHICLES_VIEW, "endpoint", "dispatch_guide.vehicles.list.endpoint", "Listar vehículos (API)", "/dispatch-guide/vehicles", "GET", false, null, OPERATOR_LIKE],
  [335, VEHICLES_VIEW, "button", "dispatch_guide.vehicles.create.button", "Crear vehículo", "/dispatch-guide/vehicles", "POST", false, null, ADMIN_LIKE],
  [336, VEHICLES_VIEW, "button", "dispatch_guide.vehicles.update.button", "Editar vehículo", "/dispatch-guide/vehicles/*", "PUT", false, null, ADMIN_LIKE],
  [337, VEHICLES_VIEW, "button", "dispatch_guide.vehicles.disable.button", "Deshabilitar vehículo", "/dispatch-guide/vehicles/*/disable", "PUT", false, null, ADMIN_LIKE],
  [338, DRIVERS_VIEW, "endpoint", "dispatch_guide.drivers.list.endpoint", "Listar conductores (API)", "/dispatch-guide/drivers", "GET", false, null, OPERATOR_LIKE],
  [339, DRIVERS_VIEW, "button", "dispatch_guide.drivers.create.button", "Crear conductor", "/dispatch-guide/drivers", "POST", false, null, ADMIN_LIKE],
  [340, DRIVERS_VIEW, "button", "dispatch_guide.drivers.update.button", "Editar conductor", "/dispatch-guide/drivers/*", "PUT", false, null, ADMIN_LIKE],
  [341, DRIVERS_VIEW, "button", "dispatch_guide.drivers.disable.button", "Deshabilitar conductor", "/dispatch-guide/drivers/*/disable", "PUT", false, null, ADMIN_LIKE],
];

const codes = resourceRows.map((row) => row[3]);

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, { replacements: [code] });
  return rows[0]?.id ?? null;
};

const idIsTaken = async (queryInterface, table, id) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT 1 FROM ${table} WHERE id = ?`, { replacements: [id] });
  return rows.length > 0;
};

const ensureModule = async (queryInterface) => {
  const existing = await findIdByCode(queryInterface, "modules", MODULE_CODE);
  if (existing) return existing;

  const [afterRows] = await queryInterface.sequelize.query("SELECT position FROM modules WHERE code = ?", {
    replacements: [AFTER_MODULE_CODE],
  });
  const position = afterRows[0] ? Number(afterRows[0].position) + 1 : 99;
  await queryInterface.sequelize.query("UPDATE modules SET position = position + 1 WHERE position >= ?", { replacements: [position] });

  const row = {
    code: MODULE_CODE,
    name: "Guías de remisión",
    description: "Guías de remisión remitente, vehículos y conductores",
    icon: "truck",
    position,
    active: true,
    created_at: now,
  };
  const taken = await idIsTaken(queryInterface, "modules", PREFERRED_MODULE_ID);
  await queryInterface.bulkInsert("modules", [taken ? row : { id: PREFERRED_MODULE_ID, ...row }]);
  return findIdByCode(queryInterface, "modules", MODULE_CODE);
};

const insertResource = async (queryInterface, { preferredId, moduleId, parentId, type, code, name, route, verb, showInMenu, icon }) => {
  if (await findIdByCode(queryInterface, "resources", code)) return;
  const row = {
    module_id: moduleId,
    parent_id: parentId,
    type,
    code,
    name,
    description: null,
    route,
    verb,
    icon,
    show_in_menu: showInMenu,
    position: preferredId,
    active: true,
    created_at: now,
  };
  const taken = await idIsTaken(queryInterface, "resources", preferredId);
  await queryInterface.bulkInsert("resources", [taken ? row : { id: preferredId, ...row }]);
};

// Lo recibe cada rol que ya tiene alguno de `likeCodes` (sin duplicar).
const grantLike = (queryInterface, resourceId, likeCodes) =>
  queryInterface.sequelize.query(
    `INSERT INTO roles_resources (role_id, resource_id, created_at)
     SELECT DISTINCT rr.role_id, :resourceId, NOW()
     FROM roles_resources rr
     INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code IN (:likeCodes)
     WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
    { replacements: { resourceId, likeCodes } }
  );

module.exports = {
  async up(queryInterface) {
    const moduleId = await ensureModule(queryInterface);
    for (const [preferredId, parentCode, type, code, name, route, verb, showInMenu, icon, grantLikeCodes] of resourceRows) {
      const parentId = parentCode ? await findIdByCode(queryInterface, "resources", parentCode) : null;
      await insertResource(queryInterface, { preferredId, moduleId, parentId, type, code, name, route, verb, showInMenu, icon });
      await grantLike(queryInterface, await findIdByCode(queryInterface, "resources", code), grantLikeCodes);
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query("SELECT id FROM resources WHERE code IN (:codes)", { replacements: { codes } });
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await queryInterface.bulkDelete("roles_resources", { resource_id: ids });
      await queryInterface.bulkDelete("resources", { id: ids });
    }
    await queryInterface.bulkDelete("modules", { code: MODULE_CODE });
  },
};
