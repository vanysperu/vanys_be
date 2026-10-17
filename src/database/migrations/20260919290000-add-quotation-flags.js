"use strict";

// Tres banderas que la cotización necesita mostrar/afectar el total:
// - includes_delivery / includes_design: solo informativas, evidencian si
//   el precio ya incluye envío/diseño (se muestran en el PDF).
// - includes_igv: si aplica, el total pasa a ser subtotal * 1.18 (IGV
//   Perú). `subtotal` guarda el monto ANTES de impuesto — `total` sigue
//   siendo el monto final que el cliente debe (mismo campo que ya usa todo
//   el sistema para saldo/pagos, así no hay que tocar esa lógica en ningún
//   otro lado, solo cómo se calcula al crear/editar).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("quotation", "subtotal", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("quotation", "includes_delivery", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("quotation", "includes_design", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("quotation", "includes_igv", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Cotizaciones existentes: su `total` actual pasa a ser el `subtotal`
    // (nunca tuvieron IGV aplicado, así que son el mismo número).
    await queryInterface.sequelize.query("UPDATE quotation SET subtotal = total");
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("quotation", "subtotal");
    await queryInterface.removeColumn("quotation", "includes_delivery");
    await queryInterface.removeColumn("quotation", "includes_design");
    await queryInterface.removeColumn("quotation", "includes_igv");
  },
};
