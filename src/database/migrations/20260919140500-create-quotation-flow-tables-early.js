"use strict";

// Crea quotation_payment, quotation_expense y quotation_event en el punto
// correcto de la historia de migraciones.
//
// Por qué existe: esas tres tablas se crean en 20260920100200/100300/100400,
// migraciones escritas con fecha adelantada. Otras posteriores en la práctica
// (purchase_order_item_purchase con FK a quotation_expense, y los "widen
// description" de gastos y eventos) quedaron con fecha 2026-09-19, ANTES. En
// las bases que se fueron migrando día a día no se notó, pero una
// instalación desde cero (producción) fallaba con "Failed to open the
// referenced table 'quotation_expense'".
//
// Reutiliza las definiciones originales (una sola fuente de verdad) y cada
// una se salta si su tabla ya existe: en una base existente esta migración
// no hace nada; en una nueva crea las tablas acá, y las originales de
// 2026-09-20 pasan de largo.
const createQuotationPayment = require("./20260920100200-create-quotation-payment");
const createQuotationExpense = require("./20260920100300-create-quotation-expense");
const createQuotationEvent = require("./20260920100400-create-quotation-event");

module.exports = {
  async up(queryInterface, Sequelize) {
    await createQuotationPayment.up(queryInterface, Sequelize);
    await createQuotationExpense.up(queryInterface, Sequelize);
    await createQuotationEvent.up(queryInterface, Sequelize);
  },

  // Las tablas pertenecen a sus migraciones originales: deshacer esta no
  // borra nada.
  async down() {},
};
