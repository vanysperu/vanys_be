"use strict";

const { columnExists, indexExists, tableExists } = require("../migration-helpers");

// Corrección de dinero en TODAS las fuentes de Caja (pedido explícito del
// usuario: "editar en el lugar + historial inmutable", ahora también para
// pagos, gastos, compras, deudas manuales y reposiciones). Reemplaza a
// 20261101100000-create-cash-movement-correction.js, que nunca se publicó
// (solo existía en la base local de desarrollo):
//
//   1. Crea money_correction: UNA tabla de historial para todas las fuentes.
//      source_type usa exactamente los mismos nombres que la columna
//      `source` de Caja (manual, quotation_payment, quotation_expense,
//      employee_debt, employee_debt_payment). Una compra de orden se guarda
//      como quotation_expense (su gasto), igual que la muestra Caja.
//      Cada fila se inserta una vez y NUNCA se edita ni se borra.
//   2. Si existe la tabla vieja cash_movement_correction, copia sus filas
//      (source_type = 'manual') y recién después la elimina. Es la única
//      operación destructiva, y solo corre una vez copiado todo.
//   3. Agrega is_deleted (anulación) a quotation_expense y a
//      purchase_order_item_purchase: hasta ahora un gasto o una compra no se
//      podían anular.
//
// Idempotente: si el arranque se corta a mitad de camino, el reintento
// retoma sin duplicar (ver src/database/autoMigrate.ts). La fila vieja de
// SequelizeMeta de la migración reemplazada no molesta: autoMigrate solo
// mira archivos que todavía no se aplicaron.
//
// Tipos de las llaves: company.id, business_unit.id y user.id son BIGINT
// (20260912232800/02/04-create-*.js).

const SOURCE_TYPES = "'manual', 'quotation_payment', 'quotation_expense', 'employee_debt', 'employee_debt_payment'";

const createMoneyCorrection = async (queryInterface) => {
  if (await tableExists(queryInterface, "money_correction")) return;

  // Una sentencia (columnas, llaves y CHECK juntos): o se crea completa o no
  // se crea. Sin charset fijo: hereda el de la base (la collation de MySQL 8
  // no existe en MariaDB). En MariaDB, JSON es un alias de LONGTEXT con
  // JSON_VALID.
  //
  // - source_id sin llave foránea: apunta a tablas distintas según
  //   source_type. Ninguna de esas filas se borra físicamente (Caja solo
  //   anula), así que el historial nunca queda huérfano.
  // - kind: 'correction' hoy; 'adjustment' queda reservado para el cierre
  //   mensual de caja (fase 2).
  // - previous_values / new_values: JSON solo con los campos que cambiaron
  //   (más fotos derivadas: nombre de la cuenta, asignaciones, etc.).
  await queryInterface.sequelize.query(`
    CREATE TABLE money_correction (
      id BIGINT NOT NULL AUTO_INCREMENT,
      company_id BIGINT NOT NULL,
      business_unit_id BIGINT NULL,
      source_type ENUM(${SOURCE_TYPES}) NOT NULL,
      source_id BIGINT NOT NULL,
      kind ENUM('correction', 'adjustment') NOT NULL DEFAULT 'correction',
      previous_values JSON NOT NULL,
      new_values JSON NOT NULL,
      reason VARCHAR(500) NOT NULL,
      created_by BIGINT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_by BIGINT NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_money_correction_source_created (source_type, source_id, created_at),
      KEY idx_money_correction_company_created (company_id, created_at),
      KEY idx_money_correction_business_unit (business_unit_id),
      CONSTRAINT fk_money_correction_company_id FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_money_correction_business_unit_id FOREIGN KEY (business_unit_id)
        REFERENCES business_unit (id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT chk_money_correction_reason CHECK (CHAR_LENGTH(TRIM(reason)) >= 5)
    ) ENGINE = InnoDB
  `);
};

// Copia el historial de la tabla vieja y la elimina, en una transacción: si
// la copia falla, la tabla vieja queda intacta. NOT EXISTS evita duplicar si
// un arranque anterior copió pero se cortó antes del DROP. Un motivo de
// menos de 5 caracteres (la tabla vieja solo exigía 1) se completa para no
// violar el CHECK nuevo: nunca se pierde una fila del historial.
const migrateOldCorrections = async (queryInterface) => {
  if (!(await tableExists(queryInterface, "cash_movement_correction"))) return;

  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.sequelize.query(
      `INSERT INTO money_correction
         (company_id, business_unit_id, source_type, source_id, kind, previous_values, new_values, reason,
          created_by, created_at, updated_by, updated_at)
       SELECT c.company_id, c.business_unit_id, 'manual', c.cash_movement_id, 'correction',
              c.previous_values, c.new_values,
              CASE WHEN CHAR_LENGTH(TRIM(c.reason)) >= 5 THEN c.reason
                   ELSE CONCAT(TRIM(c.reason), ' (motivo original)') END,
              c.created_by, c.created_at, c.updated_by, c.updated_at
       FROM cash_movement_correction c
       WHERE NOT EXISTS (
         SELECT 1 FROM money_correction m
         WHERE m.source_type = 'manual' AND m.source_id = c.cash_movement_id
           AND m.created_at = c.created_at AND m.created_by = c.created_by
       )`,
      { transaction }
    );
  });

  // DDL fuera de la transacción (en MySQL un DROP hace commit implícito).
  await queryInterface.dropTable("cash_movement_correction");
};

// Anulación de gastos y compras: false para todo lo existente (nada estaba
// anulado). Índice para los listados que filtran gastos vigentes de una
// cotización / compras vigentes de un item.
const ANNULMENT_COLUMNS = [
  { table: "quotation_expense", index: "idx_quotation_expense_quotation_deleted", fields: ["quotation_id", "is_deleted"] },
  {
    table: "purchase_order_item_purchase",
    index: "idx_pop_item_deleted",
    fields: ["purchase_order_item_id", "is_deleted"],
  },
];

const addAnnulmentColumns = async (queryInterface, Sequelize) => {
  for (const { table, index, fields } of ANNULMENT_COLUMNS) {
    if (!(await columnExists(queryInterface, table, "is_deleted"))) {
      await queryInterface.addColumn(table, "is_deleted", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!(await indexExists(queryInterface, table, index))) {
      await queryInterface.addIndex(table, { fields, name: index });
    }
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await createMoneyCorrection(queryInterface);
    await migrateOldCorrections(queryInterface);
    await addAnnulmentColumns(queryInterface, Sequelize);
  },

  // Revierte sin perder datos de dinero: quita las columnas de anulación
  // solo si nada está anulado (si no, un gasto o una compra anulados
  // volverían a sumar en Caja). money_correction NO se borra: es el
  // historial de auditoría y no se puede reconstruir — si hiciera falta,
  // se elimina a mano después de respaldarlo. Nunca usar
  // db:migrate:undo sobre la base de desarrollo compartida.
  async down(queryInterface) {
    for (const { table, index } of ANNULMENT_COLUMNS) {
      if (!(await columnExists(queryInterface, table, "is_deleted"))) continue;
      const [[{ annulled }]] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) AS annulled FROM ${table} WHERE is_deleted = true`
      );
      if (Number(annulled) > 0) {
        console.warn(`[migración] No se quitó ${table}.is_deleted: ${annulled} fila(s) están anuladas`);
        continue;
      }
      if (await indexExists(queryInterface, table, index)) await queryInterface.removeIndex(table, index);
      await queryInterface.removeColumn(table, "is_deleted");
    }
  },
};
