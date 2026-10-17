"use strict";

// Estándar global de vigencia de cotización (5 días) como fila de
// "Variables Generales" — antes no existía ningún valor real (valid_until
// nunca se calculaba solo, quedaba en null salvo que alguien lo mandara a
// mano, cosa que el formulario de crear cotización ni siquiera permite).
// Una empresa puede sobreescribirlo creando su propia fila con la misma
// categoría/código (ver quotation/services/shared/quotation_validity.ts).
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert("general_variable", [
      {
        category: "quotation_config",
        title: "Configuración de cotizaciones",
        prefix_id: "validity_days",
        name: "5",
        description: "Días de vigencia de una cotización antes de vencer automáticamente si no fue aceptada",
        ref1: null,
        ref2: null,
        company_id: null,
        is_deleted: false,
        created_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("general_variable", {
      category: "quotation_config",
      prefix_id: "validity_days",
      company_id: null,
    });
  },
};
