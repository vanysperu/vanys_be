"use strict";

// "Requiere personalización" en OFF para TODOS los productos (pedido explícito
// del usuario): se subieron encendidos y no corresponde. Desde ahora lo
// enciende una persona desde el sistema, producto por producto; la carga
// masiva (public_product/bulk) ya no lo toca.
//
// Migración de datos sin usuario en sesión: se actualiza updated_at y se deja
// updated_by como estaba (no hay un actor real al que atribuirlo).
// El usuario confirmó que hoy ninguna cotización usa personalización, así que
// apagarlo no cambia el precio de ninguna cotización existente.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE product SET requires_customization = false, updated_at = UTC_TIMESTAMP() WHERE requires_customization = true"
    );
  },

  // Irreversible: no se guarda cuáles estaban encendidos.
  async down() {},
};
