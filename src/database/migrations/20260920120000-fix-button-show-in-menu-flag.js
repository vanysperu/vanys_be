"use strict";

// "show_in_menu" solo tiene sentido para resources tipo "view" (lo que
// arma el árbol del sidebar en access.service.ts) — una migración anterior
// (20260919090000-convert-platform-mutations-to-buttons) marcó por error
// show_in_menu=true al reclasificar estos endpoints como "button". No
// afectaba el menú (el árbol ya filtra por type="view" antes de mirar esta
// bandera), pero deja el dato inconsistente para cualquier lectura futura.
const BUTTON_IDS_WITH_WRONG_FLAG = [33, 34, 35, 37, 38, 39];

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkUpdate(
      "resources",
      { show_in_menu: false },
      { id: BUTTON_IDS_WITH_WRONG_FLAG, type: "button" }
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkUpdate(
      "resources",
      { show_in_menu: true },
      { id: BUTTON_IDS_WITH_WRONG_FLAG, type: "button" }
    );
  },
};
