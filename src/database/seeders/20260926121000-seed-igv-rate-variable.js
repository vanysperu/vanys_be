"use strict";

// Configuración global por defecto del IGV (18%, Perú) como fila de
// "Variables Generales" — antes estaba hardcodeado en quotation.model.ts
// (IGV_RATE = 0.18), pedido explícito del usuario: "no se ve el igv que
// debe venir de una variable general, ese configurador de igv". Una
// empresa puede sobreescribirlo creando su propia fila con la misma
// categoría/código (ver core/rbac equivalente en
// quotation/services/shared/tax_config.ts).
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert("general_variable", [
      {
        category: "tax_config",
        title: "Configuración de impuestos",
        prefix_id: "igv_rate",
        name: "18",
        description: "Porcentaje de IGV aplicado a las cotizaciones que lo incluyan (ej. 18 = 18%)",
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
      category: "tax_config",
      prefix_id: "igv_rate",
      company_id: null,
    });
  },
};
