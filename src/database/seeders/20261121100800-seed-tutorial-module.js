"use strict";

// Módulo "Aprender" (tutorial, modo enseñanza, pedido del usuario 21-nov):
// lecciones guiadas que se practican en una empresa de práctica.
// Tablas y columnas en 20261121100400-tutorial-practice-mode.js.
//
// Todo rol de empresa lo recibe (como "Inicio": inicio.view), porque todos
// tienen que poder aprender. El "avance del equipo" solo los administradores
// (como payment.update.button). El Super Administrador (is_system) ya tiene todo.
//
// Módulo, vista y roles se resuelven por CÓDIGO (los ids son solo
// preferidos). Idempotente. Los roles nuevos lo reciben por
// DEFAULT_RESOURCE_CODES (role.services.ts).
const now = new Date();

const MODULE_CODE = "tutorial";
const PREFERRED_MODULE_ID = 29;
// En el menú, después de Recordatorios.
const AFTER_MODULE_CODE = "reminder";
const VIEW_CODE = "tutorial.view";

const EVERY_COMPANY_ROLE = ["inicio.view"];
const ADMINS = ["payment.update.button"];

// [id preferido, padre, type, code, name, route, verb, show_in_menu, icon, otorgar como]
const resourceRows = [
  [365, null, "view", VIEW_CODE, "Aprender", "/aprender", null, true, "graduation-cap", EVERY_COMPANY_ROLE],
  [366, VIEW_CODE, "endpoint", "tutorial.practice.start.endpoint", "Entrar a la empresa de práctica (API)", "/tutorial/practice/start", "POST", false, null, EVERY_COMPANY_ROLE],
  [367, VIEW_CODE, "endpoint", "tutorial.practice.reset.endpoint", "Reiniciar la empresa de práctica (API)", "/tutorial/practice/reset", "POST", false, null, EVERY_COMPANY_ROLE],
  [368, VIEW_CODE, "endpoint", "tutorial.practice.prepare.endpoint", "Preparar datos de una lección (API)", "/tutorial/practice/prepare", "POST", false, null, EVERY_COMPANY_ROLE],
  [369, VIEW_CODE, "endpoint", "tutorial.progress.list.endpoint", "Ver mi avance (API)", "/tutorial/progress", "GET", false, null, EVERY_COMPANY_ROLE],
  [370, VIEW_CODE, "endpoint", "tutorial.progress.save.endpoint", "Guardar mi avance (API)", "/tutorial/progress/*", "PUT", false, null, EVERY_COMPANY_ROLE],
  [371, VIEW_CODE, "button", "tutorial.teamProgress.button", "Ver el avance del equipo", "/tutorial/team-progress", "GET", false, null, ADMINS],
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
    name: "Aprender",
    description: "Modo enseñanza: lecciones guiadas en una empresa de práctica",
    icon: "graduation-cap",
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
    if (!moduleId) return;

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
