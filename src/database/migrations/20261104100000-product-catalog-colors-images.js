"use strict";

const { tableExists, columnExists, constraintExists, indexExists } = require("../migration-helpers");

// Catálogo de productos ampliado (pedido explícito del usuario):
//
// 1. product.category_id / product.subcategory_id: categoría y subcategoría.
//    Viven en Variables Generales (general_variable, category =
//    "product_category" / "product_subcategory"; la subcategoría guarda en
//    ref1 el id de su categoría). Globales (company_id NULL) o de una empresa.
// 2. product.image_path: foto del producto, guardada en la base como los
//    logos (company_asset); acá va su ruta pública.
// 3. product_color: un producto puede venir en varios colores (nombre +
//    código hex opcional, en orden).
// 4. company.product_images_enabled: el Super Administrador habilita o
//    deshabilita las fotos de productos por empresa.
// 5. api_key_company: empresas EXTRA a las que una API key puede replicar
//    productos en la subida masiva (además de la suya). Las asigna el Super
//    Administrador; sin filas, la key solo escribe en su propia empresa.
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "company", "product_images_enabled"))) {
      await queryInterface.addColumn("company", "product_images_enabled", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!(await columnExists(queryInterface, "product", "category_id"))) {
      await queryInterface.addColumn("product", "category_id", { type: Sequelize.BIGINT, allowNull: true });
    }
    if (!(await columnExists(queryInterface, "product", "subcategory_id"))) {
      await queryInterface.addColumn("product", "subcategory_id", { type: Sequelize.BIGINT, allowNull: true });
    }
    if (!(await columnExists(queryInterface, "product", "image_path"))) {
      await queryInterface.addColumn("product", "image_path", { type: Sequelize.STRING(255), allowNull: true });
    }
    if (!(await constraintExists(queryInterface, "product", "fk_product_category_id"))) {
      await queryInterface.addConstraint("product", {
        fields: ["category_id"],
        type: "foreign key",
        name: "fk_product_category_id",
        references: { table: "general_variable", field: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
    }
    if (!(await constraintExists(queryInterface, "product", "fk_product_subcategory_id"))) {
      await queryInterface.addConstraint("product", {
        fields: ["subcategory_id"],
        type: "foreign key",
        name: "fk_product_subcategory_id",
        references: { table: "general_variable", field: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
    }
    // Filtros de listado por categoría/subcategoría dentro de una empresa, y
    // búsqueda por SKU en la subida masiva (upsert).
    if (!(await indexExists(queryInterface, "product", "idx_product_company_category"))) {
      await queryInterface.addIndex("product", {
        fields: ["company_id", "category_id", "subcategory_id"],
        name: "idx_product_company_category",
      });
    }
    if (!(await indexExists(queryInterface, "product", "idx_product_company_sku"))) {
      await queryInterface.addIndex("product", { fields: ["company_id", "sku"], name: "idx_product_company_sku" });
    }

    if (!(await tableExists(queryInterface, "product_color"))) {
      await queryInterface.createTable("product_color", {
        id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
        company_id: { type: Sequelize.BIGINT, allowNull: false },
        product_id: { type: Sequelize.BIGINT, allowNull: false },
        name: { type: Sequelize.STRING(60), allowNull: false },
        hex_code: { type: Sequelize.STRING(7), allowNull: true },
        position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_by: { type: Sequelize.BIGINT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_by: { type: Sequelize.BIGINT, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: true },
      });
      await queryInterface.addConstraint("product_color", {
        fields: ["product_id"],
        type: "foreign key",
        name: "fk_product_color_product_id",
        references: { table: "product", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addConstraint("product_color", {
        fields: ["company_id"],
        type: "foreign key",
        name: "fk_product_color_company_id",
        references: { table: "company", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addIndex("product_color", { fields: ["product_id", "position"], name: "idx_product_color_product" });
      // Filtro "productos de color X" de una empresa.
      await queryInterface.addIndex("product_color", { fields: ["company_id", "name"], name: "idx_product_color_company_name" });
    }

    if (!(await tableExists(queryInterface, "api_key_company"))) {
      await queryInterface.createTable("api_key_company", {
        id: { type: Sequelize.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
        api_key_id: { type: Sequelize.BIGINT, allowNull: false },
        company_id: { type: Sequelize.BIGINT, allowNull: false },
        created_by: { type: Sequelize.BIGINT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_by: { type: Sequelize.BIGINT, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: true },
      });
      await queryInterface.addConstraint("api_key_company", {
        fields: ["api_key_id"],
        type: "foreign key",
        name: "fk_api_key_company_api_key_id",
        references: { table: "api_key", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addConstraint("api_key_company", {
        fields: ["company_id"],
        type: "foreign key",
        name: "fk_api_key_company_company_id",
        references: { table: "company", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      await queryInterface.addIndex("api_key_company", {
        fields: ["api_key_id", "company_id"],
        unique: true,
        name: "uq_api_key_company",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("api_key_company");
    await queryInterface.dropTable("product_color");
    await queryInterface.removeConstraint("product", "fk_product_subcategory_id");
    await queryInterface.removeConstraint("product", "fk_product_category_id");
    await queryInterface.removeIndex("product", "idx_product_company_category");
    await queryInterface.removeIndex("product", "idx_product_company_sku");
    await queryInterface.removeColumn("product", "image_path");
    await queryInterface.removeColumn("product", "subcategory_id");
    await queryInterface.removeColumn("product", "category_id");
    await queryInterface.removeColumn("company", "product_images_enabled");
  },
};
