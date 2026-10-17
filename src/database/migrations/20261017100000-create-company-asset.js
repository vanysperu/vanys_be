"use strict";

// Imágenes de marca de cada empresa (logo, QR de Yape/Plin) guardadas EN LA
// BASE DE DATOS en vez del disco del servidor.
//
// Motivo: el hosting de producción (Hostinger, sin VPS) reemplaza la carpeta
// de la app en CADA despliegue — incluso al guardar una variable de entorno
// desde el panel —, así que todo lo subido a `uploads/` se perdía sin aviso
// y los PDF quedaban sin logo. En la base sobreviven a cualquier despliegue
// y quedan incluidas en cada respaldo/exportación de la base.
//
// Volumen chico (pocas imágenes por empresa, máximo 2 MB c/u): MEDIUMBLOB
// alcanza de sobra (hasta 16 MB) y no hace falta un almacenamiento externo.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "company_asset",
      {
        id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
        company_id: { type: Sequelize.BIGINT, allowNull: false },
        // "<uuid>.<ext>" — es el último tramo de la URL pública
        // (/uploads/company-assets/<company_id>/<file_name>).
        file_name: { type: Sequelize.STRING(64), allowNull: false },
        mime_type: { type: Sequelize.STRING(50), allowNull: false },
        size_bytes: { type: Sequelize.INTEGER, allowNull: false },
        data: { type: Sequelize.BLOB("medium"), allowNull: false },
        created_by: { type: Sequelize.BIGINT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_by: { type: Sequelize.BIGINT, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: true },
      },
      { charset: "utf8mb4", collate: "utf8mb4_unicode_ci" }
    );

    await queryInterface.addConstraint("company_asset", {
      fields: ["company_id"],
      type: "foreign key",
      name: "fk_company_asset_company_id",
      references: { table: "company", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    // Cada imagen se busca siempre por (empresa, archivo) al servirla.
    await queryInterface.addIndex("company_asset", {
      fields: ["company_id", "file_name"],
      unique: true,
      name: "uq_company_asset_company_file",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("company_asset");
  },
};
