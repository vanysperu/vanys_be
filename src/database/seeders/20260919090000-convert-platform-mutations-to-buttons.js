"use strict";

// La seeder original de "platform" (20260913031813) sembró create/update/
// disable de company y business_unit como tipo "endpoint" con el comentario
// "no hay pantalla de frontend en este pase" — ya no es así: el frontend
// agregó CompaniesPage/BusinessUnitsPage con botones de crear/actualizar/
// deshabilitar. Mismo patrón que "users" (seed-base-rbac.js): una acción
// disparada por un botón de UI es tipo "button", no "endpoint" — así
// aparece en GET /access/me -> buttons[] y el front puede mostrar/ocultar
// el botón por rol.
//
// Se ACTUALIZAN las filas existentes (no se insertan nuevas) porque hay un
// índice único (route, verb) en resources — la ruta ya está ocupada por el
// resource "endpoint" original.
const RESOURCE_UPDATES = [
  { id: 33, code: "platform.company.create.button", name: "Crear empresa" },
  { id: 34, code: "platform.company.update.button", name: "Actualizar empresa" },
  { id: 35, code: "platform.company.disable.button", name: "Deshabilitar empresa" },
  { id: 37, code: "platform.businessUnit.create.button", name: "Crear tienda" },
  { id: 38, code: "platform.businessUnit.update.button", name: "Actualizar tienda" },
  { id: 39, code: "platform.businessUnit.disable.button", name: "Deshabilitar tienda" },
];

module.exports = {
  async up(queryInterface) {
    for (const { id, code, name } of RESOURCE_UPDATES) {
      await queryInterface.bulkUpdate(
        "resources",
        { type: "button", code, name, show_in_menu: true },
        { id },
      );
    }
  },

  async down(queryInterface) {
    const originals = {
      33: "platform.company.create.endpoint",
      34: "platform.company.update.endpoint",
      35: "platform.company.disable.endpoint",
      37: "platform.businessUnit.create.endpoint",
      38: "platform.businessUnit.update.endpoint",
      39: "platform.businessUnit.disable.endpoint",
    };
    const names = {
      33: "Crear empresa (API)",
      34: "Actualizar empresa (API)",
      35: "Deshabilitar empresa (API)",
      37: "Crear tienda (API)",
      38: "Actualizar tienda (API)",
      39: "Deshabilitar tienda (API)",
    };
    for (const id of Object.keys(originals)) {
      await queryInterface.bulkUpdate(
        "resources",
        { type: "endpoint", code: originals[id], name: names[id], show_in_menu: false },
        { id },
      );
    }
  },
};
