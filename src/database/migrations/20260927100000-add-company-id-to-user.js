"use strict";

// Hasta ahora la empresa de un usuario se derivaba SOLO a través de su
// tienda (user.business_unit_id -> business_unit.company_id) — obligaba a
// que TODO usuario tuviera tienda asignada, incluido un "admin de empresa"
// que no gestiona ninguna tienda en particular. Pedido explícito del
// usuario: "todo usuario debajo de super admin debe tener una empresa" —
// un Super Administrador puede crear un usuario con empresa pero SIN
// tienda (business_unit_id null); ese usuario necesita su company_id
// directo acá, igual que ya lo tienen "client"/"quotation" (empresa
// obligatoria + tienda opcional, CLAUDE.md sección 10).
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("user", "company_id", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });

    await queryInterface.addConstraint("user", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_user_company_id",
      references: { table: "company", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.addIndex("user", { fields: ["company_id"], name: "user_company_id_idx" });

    // Backfill: todo usuario que YA tiene tienda hereda el company_id de
    // esa tienda, para no dejar huérfano ningún dato existente.
    await queryInterface.sequelize.query(`
      UPDATE \`user\` u
      INNER JOIN \`business_unit\` bu ON u.business_unit_id = bu.id
      SET u.company_id = bu.company_id
      WHERE u.business_unit_id IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("user", "user_company_id_idx");
    await queryInterface.removeConstraint("user", "fk_user_company_id");
    await queryInterface.removeColumn("user", "company_id");
  },
};
