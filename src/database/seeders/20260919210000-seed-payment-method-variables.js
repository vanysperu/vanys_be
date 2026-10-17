"use strict";

// Métodos de pago como catálogo GLOBAL en general_variable (mismo patrón
// que production_stage/document_type/gender): una empresa puede añadir sus
// propios métodos (ej. una billetera digital local) creando más filas de
// esta categoría con su company_id, desde Variables Generales.
const CATEGORY = "payment_method";
const TITLE = "Método de pago";

const METHODS = [
  { prefix_id: "cash", name: "Efectivo" },
  { prefix_id: "yape", name: "Yape" },
  { prefix_id: "plin", name: "Plin" },
  { prefix_id: "transfer", name: "Transferencia bancaria" },
  { prefix_id: "card", name: "Tarjeta" },
];

const rows = METHODS.map((method) => ({
  category: CATEGORY,
  title: TITLE,
  prefix_id: method.prefix_id,
  name: method.name,
  description: method.name,
  ref1: null,
  ref2: null,
  company_id: null,
}));

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("general_variable", rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("general_variable", { category: CATEGORY, company_id: null });
  },
};
