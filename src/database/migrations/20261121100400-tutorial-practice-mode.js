"use strict";

const { columnExists, tableExists } = require("../migration-helpers");

// Modo enseñanza (pedido del usuario, 21-nov): "una cuenta donde aparecen
// animaciones de 'presiona aquí' y te obligan a hacerlo, para que aprendan a
// usar el sistema", sin ensuciar los datos reales.
//
// Se practica en una EMPRESA DE PRÁCTICA propia de cada empresa real, con un
// USUARIO DE PRÁCTICA propio de cada persona. Como es una empresa más, todo el
// aislamiento multiempresa (CLAUDE.md §10) ya aplica: nada de lo que se haga
// ahí toca los datos de la empresa real.
//
//   company.is_practice              empresa de práctica (se oculta en las listas de plataforma)
//   company.practice_of_company_id   la empresa real a la que pertenece
//   user.practice_of_user_id         el usuario real que practica con esta cuenta
//   tutorial_progress                avance de cada persona (su usuario REAL) por lección

const AUDIT_COLUMNS = `
      created_by BIGINT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NOT NULL,
      updated_at DATETIME NOT NULL`;

const CREATE_TUTORIAL_PROGRESS = `
    CREATE TABLE tutorial_progress (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      lesson_code VARCHAR(60) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
      step_index INT NOT NULL DEFAULT 0,
      completed_at DATETIME NULL,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      UNIQUE KEY uq_tutorial_progress_user_lesson (user_id, lesson_code),
      KEY idx_tutorial_progress_company (company_id, created_at),
      CONSTRAINT fk_tutorial_progress_company_id FOREIGN KEY (company_id) REFERENCES company (id),
      CONSTRAINT fk_tutorial_progress_user_id FOREIGN KEY (user_id) REFERENCES \`user\` (id),
      CONSTRAINT chk_tutorial_progress_status CHECK (status IN ('in_progress', 'completed')),
      CONSTRAINT chk_tutorial_progress_step CHECK (step_index >= 0)
    ) ENGINE = InnoDB`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "company", "is_practice"))) {
      await queryInterface.addColumn("company", "is_practice", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      await queryInterface.addIndex("company", { fields: ["is_practice"], name: "idx_company_is_practice" });
    }
    if (!(await columnExists(queryInterface, "company", "practice_of_company_id"))) {
      await queryInterface.addColumn("company", "practice_of_company_id", { type: Sequelize.BIGINT, allowNull: true });
      await queryInterface.addConstraint("company", {
        fields: ["practice_of_company_id"],
        type: "foreign key",
        name: "fk_company_practice_of_company_id",
        references: { table: "company", field: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
      await queryInterface.addIndex("company", { fields: ["practice_of_company_id"], name: "idx_company_practice_of" });
    }
    if (!(await columnExists(queryInterface, "user", "practice_of_user_id"))) {
      await queryInterface.addColumn("user", "practice_of_user_id", { type: Sequelize.BIGINT, allowNull: true });
      await queryInterface.addConstraint("user", {
        fields: ["practice_of_user_id"],
        type: "foreign key",
        name: "fk_user_practice_of_user_id",
        references: { table: "user", field: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
      // Un usuario real tiene a lo más un usuario de práctica.
      await queryInterface.addIndex("user", {
        fields: ["practice_of_user_id"],
        name: "uq_user_practice_of_user_id",
        unique: true,
      });
    }
    if (!(await tableExists(queryInterface, "tutorial_progress"))) {
      await queryInterface.sequelize.query(CREATE_TUTORIAL_PROGRESS);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS tutorial_progress");
    if (await columnExists(queryInterface, "user", "practice_of_user_id")) {
      await queryInterface.removeConstraint("user", "fk_user_practice_of_user_id");
      await queryInterface.removeIndex("user", "uq_user_practice_of_user_id");
      await queryInterface.removeColumn("user", "practice_of_user_id");
    }
    if (await columnExists(queryInterface, "company", "practice_of_company_id")) {
      await queryInterface.removeConstraint("company", "fk_company_practice_of_company_id");
      await queryInterface.removeIndex("company", "idx_company_practice_of");
      await queryInterface.removeColumn("company", "practice_of_company_id");
    }
    if (await columnExists(queryInterface, "company", "is_practice")) {
      await queryInterface.removeIndex("company", "idx_company_is_practice");
      await queryInterface.removeColumn("company", "is_practice");
    }
  },
};
