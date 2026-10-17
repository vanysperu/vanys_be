"use strict";

// Etapas de producción por defecto, como catálogo GLOBAL en general_variable
// (company_id NULL = visible para todas las empresas, mismo patrón que
// document_type/gender — ver 20260916180100-seed-document-types.js). Una
// empresa puede añadir sus propias etapas extra creando más filas de esta
// misma categoría con su company_id (pantalla "Variables Generales").
//
// ref1 = color hex (para pintar la columna en el mini-kanban del frontend).
// ref2 = posición/orden (string numérico) — define la adyacencia permitida
// al mover un producto de etapa (no se puede saltar etapas).
const CATEGORY = "production_stage";
const TITLE = "Etapa de producción";

const STAGES = [
  { prefix_id: "design", name: "Diseño", color: "#7A5AF8", position: 0 },
  { prefix_id: "supplies", name: "Insumos", color: "#C7861B", position: 1 },
  { prefix_id: "production", name: "Producción", color: "#1F5FC0", position: 2 },
  { prefix_id: "ready", name: "Listo", color: "#1F8A5F", position: 3 },
];

const rows = STAGES.map((stage) => ({
  category: CATEGORY,
  title: TITLE,
  prefix_id: stage.prefix_id,
  name: stage.name,
  description: stage.name,
  ref1: stage.color,
  ref2: String(stage.position),
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
