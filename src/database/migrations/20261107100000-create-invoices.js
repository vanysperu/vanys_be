"use strict";

const { columnExists, tableExists } = require("../migration-helpers");

// Facturas (pedido explícito del usuario): al registrar una compra se marca si
// llevaba factura y al cerrar una cotización si se emitió; la foto o el archivo
// se sube en ese momento o después ("facturas que faltan subir"). Cada empresa
// guarda sus facturas en el sistema, en su Google Drive o en ambos, según lo
// configure el Super Administrador.
module.exports = {
  async up(queryInterface, Sequelize) {
    // Dónde guarda facturas cada empresa (los dos pueden estar activos).
    if (!(await columnExists(queryInterface, "company", "invoice_storage_system"))) {
      await queryInterface.addColumn("company", "invoice_storage_system", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
    if (!(await columnExists(queryInterface, "company", "invoice_storage_drive"))) {
      await queryInterface.addColumn("company", "invoice_storage_drive", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    // Google Drive conectado de cada empresa (una cuenta por empresa). El
    // refresh token se guarda CIFRADO (ver google_drive/services/shared/token_crypto.ts).
    if (!(await tableExists(queryInterface, "company_drive_connection"))) {
      await queryInterface.createTable("company_drive_connection", {
        id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
        company_id: { type: Sequelize.BIGINT, allowNull: false },
        google_email: { type: Sequelize.STRING(255), allowNull: false },
        refresh_token_encrypted: { type: Sequelize.TEXT, allowNull: false },
        // Carpeta raíz "Facturas - <empresa>" que el sistema creó en ese Drive.
        root_folder_id: { type: Sequelize.STRING(128), allowNull: true },
        // Último error al usar la conexión (ej. permiso revocado); null = sana.
        last_error: { type: Sequelize.STRING(500), allowNull: true },
        created_by: { type: Sequelize.BIGINT, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_by: { type: Sequelize.BIGINT, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: true },
      });
      await queryInterface.addConstraint("company_drive_connection", {
        fields: ["company_id"],
        type: "foreign key",
        name: "fk_company_drive_connection_company_id",
        references: { table: "company", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addIndex("company_drive_connection", {
        fields: ["company_id"],
        unique: true,
        name: "uq_company_drive_connection_company",
      });
    }

    if (!(await tableExists(queryInterface, "invoice"))) {
      await queryInterface.createTable("invoice", {
        id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
        company_id: { type: Sequelize.BIGINT, allowNull: false },
        // Tienda de la cotización (para el alcance de un usuario atado a una tienda).
        business_unit_id: { type: Sequelize.BIGINT, allowNull: true },
        // issued = la emitimos al cerrar una cotización; purchase = la pedimos al comprar.
        type: { type: Sequelize.ENUM("issued", "purchase"), allowNull: false },
        quotation_id: { type: Sequelize.BIGINT, allowNull: false },
        purchase_id: { type: Sequelize.BIGINT, allowNull: true },
        description: { type: Sequelize.STRING(255), allowNull: false },
        // Archivo (null = falta subirlo).
        file_name: { type: Sequelize.STRING(255), allowNull: true },
        mime_type: { type: Sequelize.STRING(100), allowNull: true },
        size_bytes: { type: Sequelize.INTEGER, allowNull: true },
        file_uploaded_at: { type: Sequelize.DATE, allowNull: true },
        file_uploaded_by: { type: Sequelize.BIGINT, allowNull: true },
        // La copia guardada en el sistema (tabla invoice_file).
        stored_in_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        // Copia en Google Drive: none = no aplica; pending = por copiar;
        // copied = copiada; failed = falló (se reintenta sola).
        drive_status: { type: Sequelize.ENUM("none", "pending", "copied", "failed"), allowNull: false, defaultValue: "none" },
        drive_file_id: { type: Sequelize.STRING(128), allowNull: true },
        drive_error: { type: Sequelize.STRING(500), allowNull: true },
        drive_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        drive_next_attempt_at: { type: Sequelize.DATE, allowNull: true },
        created_by: { type: Sequelize.BIGINT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_by: { type: Sequelize.BIGINT, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: true },
      });
      await queryInterface.addConstraint("invoice", {
        fields: ["company_id"],
        type: "foreign key",
        name: "fk_invoice_company_id",
        references: { table: "company", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addConstraint("invoice", {
        fields: ["quotation_id"],
        type: "foreign key",
        name: "fk_invoice_quotation_id",
        references: { table: "quotation", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addConstraint("invoice", {
        fields: ["purchase_id"],
        type: "foreign key",
        name: "fk_invoice_purchase_id",
        references: { table: "purchase_order_item_purchase", field: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
      // Listado por empresa y tipo, del más reciente al más antiguo.
      await queryInterface.addIndex("invoice", { fields: ["company_id", "type", "created_at"], name: "idx_invoice_company_type" });
      // Copias a Drive pendientes (las busca el reintento automático).
      await queryInterface.addIndex("invoice", { fields: ["drive_status", "drive_next_attempt_at"], name: "idx_invoice_drive_queue" });
    }

    // Bytes del archivo guardado en el sistema (aparte, para no cargarlos al listar).
    if (!(await tableExists(queryInterface, "invoice_file"))) {
      await queryInterface.createTable("invoice_file", {
        id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
        invoice_id: { type: Sequelize.BIGINT, allowNull: false },
        data: { type: Sequelize.BLOB("long"), allowNull: false },
        created_by: { type: Sequelize.BIGINT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_by: { type: Sequelize.BIGINT, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: true },
      });
      await queryInterface.addConstraint("invoice_file", {
        fields: ["invoice_id"],
        type: "foreign key",
        name: "fk_invoice_file_invoice_id",
        references: { table: "invoice", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addIndex("invoice_file", { fields: ["invoice_id"], unique: true, name: "uq_invoice_file_invoice" });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("invoice_file");
    await queryInterface.dropTable("invoice");
    await queryInterface.dropTable("company_drive_connection");
    await queryInterface.removeColumn("company", "invoice_storage_drive");
    await queryInterface.removeColumn("company", "invoice_storage_system");
  },
};
