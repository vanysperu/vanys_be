"use strict";

const { columnExists, constraintExists, tableExists } = require("../migration-helpers");

// Transferencias entre cuentas de la misma empresa (pedido explícito del
// usuario: "implementa lo que es transacción entre cuentas y arregla los montos
// inflados"). Antes, pasar plata de una cuenta a otra se registraba como un
// egreso manual + un ingreso manual: el saldo de cada cuenta quedaba bien, pero
// los ingresos y egresos de la empresa (Caja, Estadísticas, resultado del mes)
// se inflaban por el doble del monto.
//
//   cash_transfer         una fila por transferencia: sale de una cuenta y entra
//                         a otra el MISMO día por el MISMO monto. Caja la muestra
//                         como dos filas (salida/entrada) que mueven el saldo de
//                         cada cuenta pero no son ingreso ni egreso de la empresa.
//   cash_period_balance   + columna `transfers` (neto con signo de las
//                         transferencias de esa cuenta en el mes) y el CHECK del
//                         cierre pasa a ser closing = opening + income - expense
//                         + transfers + adjustments.
//
// Idempotente y no destructiva: las filas de cierre existentes quedan con
// transfers = 0, así que el CHECK nuevo se sigue cumpliendo.

const AUDIT_COLUMNS = `
      created_by BIGINT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NOT NULL,
      updated_at DATETIME NOT NULL`;

// Las cuentas (from/to) usan RESTRICT también en ON UPDATE: MySQL no admite un
// CHECK sobre una columna con llave foránea en cascada (mismo criterio que
// 20261102100000-create-cash-closing.js). Efectivo = NULL.
const CREATE_CASH_TRANSFER = `
    CREATE TABLE cash_transfer (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      business_unit_id BIGINT NULL,
      from_payment_account_id BIGINT NULL,
      to_payment_account_id BIGINT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      occurred_at DATE NOT NULL,
      description VARCHAR(500) NULL,
      operation_number VARCHAR(50) NULL,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,${AUDIT_COLUMNS},
      PRIMARY KEY (id),
      KEY idx_cash_transfer_company_date (company_id, occurred_at),
      KEY idx_cash_transfer_business_unit (business_unit_id),
      KEY idx_cash_transfer_from_account (from_payment_account_id),
      KEY idx_cash_transfer_to_account (to_payment_account_id),
      KEY idx_cash_transfer_created (created_at),
      CONSTRAINT fk_cash_transfer_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_cash_transfer_business_unit_id FOREIGN KEY (business_unit_id)
        REFERENCES business_unit (id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_cash_transfer_from_account_id FOREIGN KEY (from_payment_account_id)
        REFERENCES general_variable (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT fk_cash_transfer_to_account_id FOREIGN KEY (to_payment_account_id)
        REFERENCES general_variable (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT chk_cash_transfer_amount CHECK (amount > 0),
      CONSTRAINT chk_cash_transfer_accounts CHECK (NOT (from_payment_account_id <=> to_payment_account_id))
    ) ENGINE = InnoDB`;

const OLD_CLOSING_CHECK = "closing = opening + income - expense + adjustments";
const NEW_CLOSING_CHECK = "closing = opening + income - expense + transfers + adjustments";
const CLOSING_CHECK_NAME = "chk_cash_period_balance_closing";

const replaceClosingCheck = async (queryInterface, expression) => {
  if (await constraintExists(queryInterface, "cash_period_balance", CLOSING_CHECK_NAME)) {
    await queryInterface.sequelize.query(`ALTER TABLE cash_period_balance DROP CONSTRAINT ${CLOSING_CHECK_NAME}`);
  }
  await queryInterface.sequelize.query(
    `ALTER TABLE cash_period_balance ADD CONSTRAINT ${CLOSING_CHECK_NAME} CHECK (${expression})`
  );
};

module.exports = {
  async up(queryInterface) {
    if (!(await tableExists(queryInterface, "cash_transfer"))) {
      await queryInterface.sequelize.query(CREATE_CASH_TRANSFER);
    }

    if (!(await columnExists(queryInterface, "cash_period_balance", "transfers"))) {
      await queryInterface.sequelize.query(
        "ALTER TABLE cash_period_balance ADD COLUMN transfers DECIMAL(14, 2) NOT NULL DEFAULT 0 AFTER expense"
      );
    }
    await replaceClosingCheck(queryInterface, NEW_CLOSING_CHECK);
  },

  async down(queryInterface) {
    // Volver atrás solo es seguro sin transferencias en meses cerrados: con
    // transfers <> 0 el CHECK viejo no se cumpliría (y la base lo rechaza).
    if (await columnExists(queryInterface, "cash_period_balance", "transfers")) {
      if (await constraintExists(queryInterface, "cash_period_balance", CLOSING_CHECK_NAME)) {
        await queryInterface.sequelize.query(`ALTER TABLE cash_period_balance DROP CONSTRAINT ${CLOSING_CHECK_NAME}`);
      }
      await queryInterface.sequelize.query("ALTER TABLE cash_period_balance DROP COLUMN transfers");
      await replaceClosingCheck(queryInterface, OLD_CLOSING_CHECK);
    }
    if (await tableExists(queryInterface, "cash_transfer")) {
      await queryInterface.sequelize.query("DROP TABLE cash_transfer");
    }
  },
};
