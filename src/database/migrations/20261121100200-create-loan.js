"use strict";

const { tableExists } = require("../migration-helpers");

// Préstamos a personas (pedido del usuario, 21-nov): "cuando la empresa
// realiza un préstamo y podría cobrar interés: a quién se le prestó, cuánto y
// qué % de interés". Decisión del usuario: simple + cobros + Caja.
//
//   loan          el préstamo: capital, % de interés (simple, una sola vez
//                 sobre el capital) y total a cobrar. Sale de Caja el día del
//                 préstamo por la cuenta elegida (null = efectivo).
//   loan_payment  cada cobro: se reparte en capital e interés en proporción al
//                 total; el capital vuelve a la caja (no es ingreso) y el
//                 interés SÍ es ingreso de la empresa.
//
// Anular es soft (active = false), nunca DELETE. Montos con CHECK para que la
// base nunca guarde un préstamo o un cobro que no cuadre.

const AUDIT_COLUMNS = `
      created_by BIGINT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NOT NULL,
      updated_at DATETIME NOT NULL`;

const CREATE_LOAN = `
    CREATE TABLE loan (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      business_unit_id BIGINT NULL,
      borrower_name VARCHAR(150) NOT NULL,
      borrower_document VARCHAR(20) NULL,
      borrower_phone VARCHAR(20) NULL,
      principal DECIMAL(10, 2) NOT NULL,
      interest_rate DECIMAL(6, 2) NOT NULL DEFAULT 0,
      interest_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
      total_due DECIMAL(10, 2) NOT NULL,
      loaned_at DATE NOT NULL,
      due_date DATE NULL,
      payment_account_id BIGINT NULL,
      operation_number VARCHAR(50) NULL,
      notes VARCHAR(500) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      KEY idx_loan_company_date (company_id, loaned_at),
      KEY idx_loan_business_unit (business_unit_id),
      KEY idx_loan_payment_account (payment_account_id),
      KEY idx_loan_created (created_at),
      CONSTRAINT fk_loan_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_loan_business_unit_id FOREIGN KEY (business_unit_id)
        REFERENCES business_unit (id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_loan_payment_account_id FOREIGN KEY (payment_account_id)
        REFERENCES general_variable (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT chk_loan_principal CHECK (principal > 0),
      CONSTRAINT chk_loan_interest CHECK (interest_rate >= 0 AND interest_amount >= 0),
      CONSTRAINT chk_loan_total CHECK (total_due = principal + interest_amount)
    ) ENGINE = InnoDB`;

const CREATE_LOAN_PAYMENT = `
    CREATE TABLE loan_payment (
      id BIGINT NOT NULL AUTO_INCREMENT,
      loan_id BIGINT NOT NULL,
      company_id BIGINT NOT NULL,
      business_unit_id BIGINT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      principal_part DECIMAL(10, 2) NOT NULL,
      interest_part DECIMAL(10, 2) NOT NULL,
      paid_at DATE NOT NULL,
      payment_account_id BIGINT NULL,
      operation_number VARCHAR(50) NULL,
      notes VARCHAR(500) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      KEY idx_loan_payment_loan (loan_id, active),
      KEY idx_loan_payment_company_date (company_id, paid_at),
      KEY idx_loan_payment_business_unit (business_unit_id),
      KEY idx_loan_payment_account (payment_account_id),
      KEY idx_loan_payment_created (created_at),
      CONSTRAINT fk_loan_payment_loan_id FOREIGN KEY (loan_id)
        REFERENCES loan (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_loan_payment_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_loan_payment_business_unit_id FOREIGN KEY (business_unit_id)
        REFERENCES business_unit (id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_loan_payment_payment_account_id FOREIGN KEY (payment_account_id)
        REFERENCES general_variable (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT chk_loan_payment_amount CHECK (amount > 0 AND principal_part >= 0 AND interest_part >= 0),
      CONSTRAINT chk_loan_payment_split CHECK (amount = principal_part + interest_part)
    ) ENGINE = InnoDB`;

module.exports = {
  async up(queryInterface) {
    if (!(await tableExists(queryInterface, "loan"))) await queryInterface.sequelize.query(CREATE_LOAN);
    if (!(await tableExists(queryInterface, "loan_payment"))) await queryInterface.sequelize.query(CREATE_LOAN_PAYMENT);
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "loan_payment")) await queryInterface.sequelize.query("DROP TABLE loan_payment");
    if (await tableExists(queryInterface, "loan")) await queryInterface.sequelize.query("DROP TABLE loan");
  },
};
