"use strict";

// Módulo "Anuncios" (advertisement) y sus recursos RBAC: imágenes publicitarias
// que la web de cada empresa lista con su API key (pedido explícito del
// usuario). Tablas en 20261106110000-create-advertisement.js.
//
// Es contenido que la empresa administra, como su catálogo: se otorga a los
// roles que ya pueden crear productos (producto.create.button). El Gestor no
// lo recibe (CLAUDE.md 11.1: no gestiona configuración de la empresa). Un rol
// is_system ya tiene todo implícitamente.
//
// Módulo, vistas y roles se resuelven por CÓDIGO (los ids son solo
// preferidos). Idempotente: correrlo dos veces no duplica nada.
const now = new Date();

const MODULE_CODE = "advertisement";
const PREFERRED_MODULE_ID = 21;
// En el menú, junto a Productos (grupo Ventas, ver menuConfig.ts del frontend).
const AFTER_MODULE_CODE = "producto";
const VIEW_CODE = "advertisement.list";
const GRANT_LIKE_CODE = "producto.create.button";

// [id preferido, padre (código o null), type, code, name, route, verb, show_in_menu, icon]
const resourceRows = [
  [228, null, "view", VIEW_CODE, "Anuncios", "/anuncios", null, true, "megaphone"],
  [229, VIEW_CODE, "endpoint", "advertisement.list.endpoint", "Listar anuncios (API)", "/advertisement/list", "GET", false, null],
  [230, VIEW_CODE, "button", "advertisement.create.button", "Crear anuncio", "/advertisement/create", "POST", false, null],
  [231, VIEW_CODE, "button", "advertisement.image.button", "Subir imagen de anuncio", "/advertisement/image", "POST", false, null],
  [232, VIEW_CODE, "button", "advertisement.update.button", "Editar anuncio", "/advertisement/update/*", "PUT", false, null],
  [233, VIEW_CODE, "button", "advertisement.position.button", "Cambiar el orden de un anuncio", "/advertisement/position/*", "PUT", false, null],
  [234, VIEW_CODE, "button", "advertisement.disable.button", "Apagar o prender un anuncio", "/advertisement/disable/*", "PUT", false, null],
  [235, VIEW_CODE, "button", "advertisement.delete.button", "Eliminar anuncio (definitivo)", "/advertisement/delete/*", "DELETE", false, null],
];

const codes = resourceRows.map((row) => row[3]);

const findIdByCode = async (queryInterface, table, code) => {
  const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE code = ?`, {
    replacements: [code],
  });
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
  await queryInterface.sequelize.query("UPDATE modules SET position = position + 1 WHERE position >= ?", {
    replacements: [position],
  });

  const row = {
    code: MODULE_CODE,
    name: "Anuncios",
    description: "Imágenes publicitarias de la web: subir, ordenar, apagar/prender y eliminar",
    icon: "megaphone",
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

// Lo recibe cada rol que ya tiene GRANT_LIKE_CODE (sin duplicar).
const grantLike = (queryInterface, resourceId) =>
  queryInterface.sequelize.query(
    `INSERT INTO roles_resources (role_id, resource_id, created_at)
     SELECT DISTINCT rr.role_id, :resourceId, NOW()
     FROM roles_resources rr
     INNER JOIN resources existing ON existing.id = rr.resource_id AND existing.code = :grantLikeCode
     WHERE NOT EXISTS (SELECT 1 FROM roles_resources x WHERE x.role_id = rr.role_id AND x.resource_id = :resourceId)`,
    { replacements: { resourceId, grantLikeCode: GRANT_LIKE_CODE } }
  );

module.exports = {
  async up(queryInterface) {
    const moduleId = await ensureModule(queryInterface);

    for (const [preferredId, parentCode, type, code, name, route, verb, showInMenu, icon] of resourceRows) {
      const parentId = parentCode ? await findIdByCode(queryInterface, "resources", parentCode) : null;
      await insertResource(queryInterface, { preferredId, moduleId, parentId, type, code, name, route, verb, showInMenu, icon });
      await grantLike(queryInterface, await findIdByCode(queryInterface, "resources", code));
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query("SELECT id FROM resources WHERE code IN (:codes)", {
      replacements: { codes },
    });
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await queryInterface.bulkDelete("roles_resources", { resource_id: ids });
      await queryInterface.bulkDelete("resources", { id: ids });
    }
    await queryInterface.bulkDelete("modules", { code: MODULE_CODE });
  },
};
