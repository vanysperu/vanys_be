"use strict";

// OBSOLETA — no crea nada.
//
// Creaba la tabla `production_stage` (etapas de producción por empresa).
// Ese diseño se reemplazó: las etapas son filas de general_variable
// (category="production_stage") y la tabla se elimina en
// 20260919180000-drop-production-stage-table. Esa migración tiene fecha
// anterior a esta pero se aplicó después (esta se escribió con fecha
// adelantada), así que en una instalación desde cero esta correría AL FINAL
// y dejaría creada una tabla que el sistema ya no usa.
//
// Las bases que ya la aplicaron no la vuelven a correr (queda registrada en
// SequelizeMeta), así que vaciarla solo afecta a instalaciones nuevas, que
// nacen directamente con el esquema final.
module.exports = {
  async up() {},

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS `production_stage`");
  },
};
