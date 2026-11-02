"use strict";

const { tableExists } = require("../migration-helpers");

// Cierre mensual de caja (fase 2, plan cash-closing-plan.md §1.2). Crea 6
// tablas nuevas; NO toca ninguna existente (money_correction ya tenía
// reservado kind='adjustment'). Una empresa sin fila en cash_ledger se
// comporta exactamente igual que antes: ninguna restricción.
//
//   cash_ledger            libro por empresa: mes de inicio + fila de lock.
//   cash_ledger_opening    saldo inicial declarado por cuenta.
//   cash_period            mes cerrado (o reabierto) con sus totales.
//   cash_period_balance    foto por mes × cuenta.
//   cash_period_event      rastro inmutable (saldo inicial, cierres, reaperturas).
//   cash_adjustment_entry  patas de ajuste (hold/posting) de correcciones de meses cerrados.
//
// Idempotente (cada tabla solo si no existe) y no destructiva. Una sentencia
// por tabla (columnas, llaves y CHECK juntos): o se crea completa o no se
// crea. Sin charset fijo: hereda el de la base (MySQL 8 y MariaDB).
//
// Llaves: company/business_unit/general_variable/money_correction.id son
// BIGINT. MySQL no admite un CHECK sobre una columna con llave foránea EN
// CASCADA: las cuentas (payment_account_id) que aparecen en un CHECK usan
// RESTRICT también en ON UPDATE.

const AUDIT_COLUMNS = `
      created_by BIGINT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NOT NULL,
      updated_at DATETIME NOT NULL`;

const SOURCE_TYPES = "'manual', 'quotation_payment', 'quotation_expense', 'employee_debt', 'employee_debt_payment'";

// Orden de creación = orden de dependencias (llaves foráneas).
const TABLES = [
  {
    name: "cash_ledger",
    sql: `
    CREATE TABLE cash_ledger (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      start_period CHAR(7) NOT NULL,
      start_date DATE NOT NULL,
      notes VARCHAR(500) NULL,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      UNIQUE KEY uq_cash_ledger_company (company_id),
      CONSTRAINT fk_cash_ledger_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT chk_cash_ledger_start_date CHECK (DAYOFMONTH(start_date) = 1)
    ) ENGINE = InnoDB`,
  },
  {
    name: "cash_ledger_opening",
    sql: `
    CREATE TABLE cash_ledger_opening (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      cash_ledger_id BIGINT NOT NULL,
      account_key BIGINT NOT NULL,
      payment_account_id BIGINT NULL,
      account_name VARCHAR(150) NOT NULL,
      amount DECIMAL(14, 2) NOT NULL,
      history_amount DECIMAL(14, 2) NULL,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      UNIQUE KEY uq_cash_ledger_opening_account (cash_ledger_id, account_key),
      KEY idx_cash_ledger_opening_company (company_id),
      KEY idx_cash_ledger_opening_payment_account (payment_account_id),
      CONSTRAINT fk_cash_ledger_opening_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_cash_ledger_opening_ledger_id FOREIGN KEY (cash_ledger_id)
        REFERENCES cash_ledger (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_cash_ledger_opening_payment_account_id FOREIGN KEY (payment_account_id)
        REFERENCES general_variable (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT chk_cash_ledger_opening_account_key CHECK (account_key = COALESCE(payment_account_id, 0))
    ) ENGINE = InnoDB`,
  },
  {
    name: "cash_period",
    sql: `
    CREATE TABLE cash_period (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      period CHAR(7) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      status ENUM('closed', 'reopened') NOT NULL,
      opening_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
      income_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
      expense_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
      adjustment_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
      closing_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
      close_count INT NOT NULL DEFAULT 1,
      closed_by BIGINT NOT NULL,
      closed_at DATETIME NOT NULL,
      close_notes VARCHAR(500) NULL,
      reopened_by BIGINT NULL,
      reopened_at DATETIME NULL,
      reopen_reason VARCHAR(500) NULL,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      UNIQUE KEY uq_cash_period_company_period (company_id, period),
      KEY idx_cash_period_company_status (company_id, status, period),
      KEY idx_cash_period_created (created_at),
      CONSTRAINT fk_cash_period_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT chk_cash_period_bounds CHECK (period_start <= period_end),
      CONSTRAINT chk_cash_period_reopen CHECK (
        status <> 'reopened' OR (reopened_by IS NOT NULL AND CHAR_LENGTH(TRIM(reopen_reason)) >= 5)
      )
    ) ENGINE = InnoDB`,
  },
  {
    name: "cash_period_balance",
    sql: `
    CREATE TABLE cash_period_balance (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      cash_period_id BIGINT NOT NULL,
      account_key BIGINT NOT NULL,
      payment_account_id BIGINT NULL,
      account_name VARCHAR(150) NOT NULL,
      opening DECIMAL(14, 2) NOT NULL,
      income DECIMAL(14, 2) NOT NULL,
      expense DECIMAL(14, 2) NOT NULL,
      adjustments DECIMAL(14, 2) NOT NULL,
      closing DECIMAL(14, 2) NOT NULL,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      UNIQUE KEY uq_cash_period_balance_account (cash_period_id, account_key),
      KEY idx_cash_period_balance_company (company_id),
      KEY idx_cash_period_balance_payment_account (payment_account_id),
      CONSTRAINT fk_cash_period_balance_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_cash_period_balance_period_id FOREIGN KEY (cash_period_id)
        REFERENCES cash_period (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_cash_period_balance_payment_account_id FOREIGN KEY (payment_account_id)
        REFERENCES general_variable (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT chk_cash_period_balance_account_key CHECK (account_key = COALESCE(payment_account_id, 0)),
      CONSTRAINT chk_cash_period_balance_closing CHECK (closing = opening + income - expense + adjustments)
    ) ENGINE = InnoDB`,
  },
  {
    name: "cash_period_event",
    sql: `
    CREATE TABLE cash_period_event (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      period CHAR(7) NULL,
      action ENUM('opening_set', 'close', 'reclose', 'reopen', 'recalculate') NOT NULL,
      reason VARCHAR(500) NULL,
      previous_snapshot JSON NULL,
      snapshot JSON NOT NULL,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      KEY idx_cash_period_event_period (company_id, period, created_at),
      KEY idx_cash_period_event_company_created (company_id, created_at),
      CONSTRAINT fk_cash_period_event_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE = InnoDB`,
  },
  {
    name: "cash_adjustment_entry",
    sql: `
    CREATE TABLE cash_adjustment_entry (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      business_unit_id BIGINT NULL,
      money_correction_id BIGINT NOT NULL,
      source_type ENUM(${SOURCE_TYPES}) NOT NULL,
      source_id BIGINT NOT NULL,
      leg ENUM('hold', 'posting') NOT NULL,
      affected_period CHAR(7) NOT NULL,
      entry_date DATE NOT NULL,
      direction ENUM('income', 'expense') NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      payment_account_id BIGINT NULL,
      quotation_id BIGINT NULL,
      purchase_order_id BIGINT NULL,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      KEY idx_cash_adjustment_entry_company_date (company_id, entry_date),
      KEY idx_cash_adjustment_entry_affected (company_id, affected_period, leg),
      KEY idx_cash_adjustment_entry_correction (money_correction_id),
      KEY idx_cash_adjustment_entry_source (source_type, source_id),
      KEY idx_cash_adjustment_entry_business_unit (business_unit_id),
      KEY idx_cash_adjustment_entry_payment_account (payment_account_id),
      KEY idx_cash_adjustment_entry_quotation (quotation_id),
      KEY idx_cash_adjustment_entry_purchase_order (purchase_order_id),
      KEY idx_cash_adjustment_entry_created (created_at),
      CONSTRAINT fk_cash_adjustment_entry_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_cash_adjustment_entry_business_unit_id FOREIGN KEY (business_unit_id)
        REFERENCES business_unit (id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_cash_adjustment_entry_correction_id FOREIGN KEY (money_correction_id)
        REFERENCES money_correction (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_cash_adjustment_entry_payment_account_id FOREIGN KEY (payment_account_id)
        REFERENCES general_variable (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT chk_cash_adjustment_entry_amount CHECK (amount <> 0)
    ) ENGINE = InnoDB`,
  },
];

module.exports = {
  async up(queryInterface) {
    for (const { name, sql } of TABLES) {
      if (await tableExists(queryInterface, name)) continue;
      await queryInterface.sequelize.query(sql);
    }
  },

  // Los cierres son datos de auditoría: una tabla se elimina SOLO si está
  // vacía (en orden inverso, por las llaves). Si tiene filas, se avisa y se
  // deja (junto con las tablas de las que depende). Nunca usar
  // db:migrate:undo sobre la base de desarrollo compartida.
  async down(queryInterface) {
    let blocked = false;
    for (const { name } of [...TABLES].reverse()) {
      if (!(await tableExists(queryInterface, name))) continue;
      const [[{ total }]] = await queryInterface.sequelize.query(`SELECT COUNT(*) AS total FROM ${name}`);
      if (blocked || Number(total) > 0) {
        blocked = true;
        console.warn(`[migración] No se eliminó ${name}: tiene datos o una tabla dependiente tiene datos`);
        continue;
      }
      await queryInterface.dropTable(name);
    }
  },
};
