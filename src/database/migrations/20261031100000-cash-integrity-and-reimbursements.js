"use strict";

const { columnExists, tableExists } = require("../migration-helpers");

// Caja = dinero que realmente entra o sale de la empresa (pedido explícito
// del usuario: "que no sea posible malograr caja"). Antes, una compra pagada
// con plata de un trabajador figuraba como egreso el día de la compra
// (aunque la empresa no había soltado nada) y la reposición no figuraba en
// ninguna parte; un abono parcial pisaba la cuenta/fecha del anterior; y
// borrar una cuenta pasaba su historial a "Efectivo". Esta migración:
//
//   1. Corrige pagos en efectivo que quedaron con cuenta (el formulario
//      ocultaba el campo al elegir efectivo pero mandaba el valor anterior).
//   2. Agrega la cuenta desde la que la empresa pagó cada gasto.
//   3. Cambia las llaves de cuenta de SET NULL a RESTRICT: la base ya no
//      deja borrar una cuenta que tiene movimientos.
//   4. Crea employee_debt_payment (cada reposición a un trabajador, con su
//      monto, fecha y cuenta) y employee_debt_payment_allocation (qué deudas
//      cubrió cada reposición, para poder anularla con exactitud).
//   5. Reconstruye como reposiciones lo ya repuesto antes de este cambio.
//   6. Permite deudas MANUALES con un trabajador (pedido explícito del
//      usuario: "si un empleado fue a pagar los servicios y los pagó de su
//      plata"): employee_debt deja de exigir una compra de orden y guarda
//      origen, descripción, categoría, fecha y tienda; además puede quedar
//      "cancelled" (deuda manual anulada antes de reponerse).
//
// Todo es idempotente: si el arranque se corta a mitad de camino, el
// reintento retoma sin duplicar (ver src/database/autoMigrate.ts).

// Llaves existentes hacia general_variable (cuentas), creadas por
// 20261018100100-add-payment-account-to-money-movements.js con estos nombres.
const ACCOUNT_FOREIGN_KEYS = [
  { table: "quotation_payment", name: "fk_quotation_payment_payment_account_id" },
  { table: "cash_movement", name: "fk_cash_movement_payment_account_id" },
  { table: "employee_debt", name: "fk_employee_debt_payment_account_id" },
];

const findDeleteRule = async (queryInterface, constraintName) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT DELETE_RULE AS deleteRule FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`,
    { replacements: [constraintName] }
  );
  return rows[0]?.deleteRule ?? null;
};

const makeAccountForeignKeyRestrict = async (queryInterface, { table, name }) => {
  const deleteRule = await findDeleteRule(queryInterface, name);
  if (deleteRule === null || deleteRule === "RESTRICT") return;

  await queryInterface.removeConstraint(table, name);
  await queryInterface.addConstraint(table, {
    fields: ["payment_account_id"],
    type: "foreign key",
    name,
    references: { table: "general_variable", field: "id" },
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  });
};

// Día de Lima de un instante UTC guardado (Lima es UTC-5 todo el año).
const LIMA_DATE_OF = (column) => `DATE(DATE_SUB(${column}, INTERVAL 5 HOUR))`;

// Fecha de la reposición ya hecha: paid_at; si faltara, el día en que se
// marcó la deuda.
const PAID_AT_SQL = `COALESCE(ed.paid_at, ${LIMA_DATE_OF("COALESCE(ed.updated_at, ed.created_at)")})`;

// Antes de este cambio, "Marcar como pagado" reponía de una sola vez, con
// una sola cuenta y fecha, todas las deudas pendientes del trabajador: las
// filas con mismo trabajador, fecha y cuenta son UNA reposición. Exacto para
// producción (allí nunca hubo abonos parciales). Un abono parcial de una
// base de pruebas queda como una sola reposición por el total ya repuesto.
const backfillReimbursements = async (queryInterface, Sequelize) => {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const [groups] = await queryInterface.sequelize.query(
      `SELECT ed.company_id AS companyId, ed.user_id AS userId, ${PAID_AT_SQL} AS paidAt,
              ed.payment_account_id AS accountId, SUM(ed.paid_amount) AS amount,
              MIN(ed.updated_by) AS actorId, MIN(COALESCE(ed.updated_at, ed.created_at)) AS registeredAt
       FROM employee_debt ed
       WHERE ed.paid_amount > 0
         AND NOT EXISTS (SELECT 1 FROM employee_debt_payment_allocation a WHERE a.employee_debt_id = ed.id)
       GROUP BY ed.company_id, ed.user_id, ${PAID_AT_SQL}, ed.payment_account_id`,
      { transaction }
    );

    for (const group of groups) {
      const [paymentId] = await queryInterface.sequelize.query(
        `INSERT INTO employee_debt_payment
           (company_id, user_id, amount, payment_account_id, paid_at, is_deleted, created_by, created_at, updated_by, updated_at)
         VALUES (:companyId, :userId, :amount, :accountId, :paidAt, false, :actorId, :registeredAt, :actorId, :registeredAt)`,
        { replacements: group, type: Sequelize.QueryTypes.INSERT, transaction }
      );

      await queryInterface.sequelize.query(
        `INSERT INTO employee_debt_payment_allocation
           (company_id, employee_debt_payment_id, employee_debt_id, amount, created_by, created_at, updated_by, updated_at)
         SELECT ed.company_id, :paymentId, ed.id, ed.paid_amount, :actorId, :registeredAt, :actorId, :registeredAt
         FROM employee_debt ed
         WHERE ed.paid_amount > 0
           AND ed.company_id = :companyId AND ed.user_id = :userId
           AND ${PAID_AT_SQL} = :paidAt
           AND ed.payment_account_id <=> :accountId
           AND NOT EXISTS (SELECT 1 FROM employee_debt_payment_allocation a WHERE a.employee_debt_id = ed.id)`,
        { replacements: { ...group, paymentId }, transaction }
      );
    }
  });
};

const checkExists = async (queryInterface, constraintName) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'`,
    { replacements: [constraintName] }
  );
  return rows.length > 0;
};

// CHECK sobre una tabla con datos: solo si ninguna fila la viola (si no, el
// ALTER fallaría y la app no arrancaría por un dato viejo). La regla igual la
// cuida la aplicación; esto es una segunda barrera en la base. `condition`
// es texto fijo de este archivo.
const addCheckIfClean = async (queryInterface, table, name, condition) => {
  if (await checkExists(queryInterface, name)) return;
  const [[{ violations }]] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS violations FROM ${table} WHERE NOT (${condition})`
  );
  if (Number(violations) > 0) {
    console.warn(`[migración] No se agregó ${name}: ${violations} fila(s) de ${table} no la cumplen`);
    return;
  }
  await queryInterface.sequelize.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${condition})`);
};

// Deudas manuales: employee_debt ya no exige una compra de orden.
const prepareManualDebts = async (queryInterface, Sequelize) => {
  // Mismas definiciones de siempre, solo que la compra pasa a ser opcional y
  // el estado admite "cancelled". Repetirlo no cambia nada.
  await queryInterface.sequelize.query(
    "ALTER TABLE employee_debt MODIFY purchase_order_item_purchase_id BIGINT NULL"
  );
  await queryInterface.sequelize.query(
    "ALTER TABLE employee_debt MODIFY status ENUM('pending', 'paid', 'cancelled') NOT NULL DEFAULT 'pending'"
  );

  if (!(await columnExists(queryInterface, "employee_debt", "origin"))) {
    await queryInterface.addColumn("employee_debt", "origin", {
      type: Sequelize.ENUM("purchase", "manual"),
      allowNull: false,
      defaultValue: "purchase",
    });
  }
  if (!(await columnExists(queryInterface, "employee_debt", "description"))) {
    await queryInterface.addColumn("employee_debt", "description", { type: Sequelize.STRING(300), allowNull: true });
  }
  if (!(await columnExists(queryInterface, "employee_debt", "category"))) {
    await queryInterface.addColumn("employee_debt", "category", { type: Sequelize.STRING(50), allowNull: true });
  }
  if (!(await columnExists(queryInterface, "employee_debt", "business_unit_id"))) {
    await queryInterface.addColumn("employee_debt", "business_unit_id", { type: Sequelize.BIGINT, allowNull: true });
    await queryInterface.addConstraint("employee_debt", {
      fields: ["business_unit_id"],
      type: "foreign key",
      name: "fk_employee_debt_business_unit_id",
      references: { table: "business_unit", field: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  }

  // Día en que el trabajador puso el dinero. Las deudas de compras ya
  // existentes toman el día (Lima) en que se registró la compra.
  if (!(await columnExists(queryInterface, "employee_debt", "incurred_at"))) {
    await queryInterface.addColumn("employee_debt", "incurred_at", { type: Sequelize.DATEONLY, allowNull: true });
  }
  await queryInterface.sequelize.query(
    `UPDATE employee_debt SET incurred_at = ${LIMA_DATE_OF("created_at")} WHERE incurred_at IS NULL`
  );
  await queryInterface.sequelize.query("ALTER TABLE employee_debt MODIFY incurred_at DATE NOT NULL");

  const [indexes] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_debt' AND INDEX_NAME = 'idx_employee_debt_company_incurred_at'`
  );
  if (indexes.length === 0) {
    await queryInterface.addIndex("employee_debt", {
      fields: ["company_id", "incurred_at"],
      name: "idx_employee_debt_company_incurred_at",
    });
  }

  // Segunda barrera en la base. (Una regla sobre la compra no se puede: MySQL
  // no admite CHECK en columnas con llave foránea en cascada; la cuida la
  // aplicación.)
  await addCheckIfClean(queryInterface, "employee_debt", "chk_employee_debt_amount", "amount > 0");
  await addCheckIfClean(
    queryInterface,
    "employee_debt",
    "chk_employee_debt_paid_amount",
    "paid_amount >= 0 AND paid_amount <= amount"
  );
};

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Un pago en efectivo no entra a ninguna cuenta.
    await queryInterface.sequelize.query(
      "UPDATE quotation_payment SET payment_account_id = NULL WHERE method = 'cash' AND payment_account_id IS NOT NULL"
    );

    // 2. Cuenta de la empresa desde la que se pagó el gasto (null =
    //    efectivo). Un gasto pagado con plata de un trabajador no la usa: ese
    //    dinero sale de la empresa recién en la reposición.
    if (!(await columnExists(queryInterface, "quotation_expense", "payment_account_id"))) {
      await queryInterface.addColumn("quotation_expense", "payment_account_id", {
        type: Sequelize.BIGINT,
        allowNull: true,
      });
      await queryInterface.addConstraint("quotation_expense", {
        fields: ["payment_account_id"],
        type: "foreign key",
        name: "fk_quotation_expense_payment_account_id",
        references: { table: "general_variable", field: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      });
    }

    // 3. Borrar una cuenta con movimientos ya no los pasa a "Efectivo".
    for (const foreignKey of ACCOUNT_FOREIGN_KEYS) {
      await makeAccountForeignKeyRestrict(queryInterface, foreignKey);
    }

    // 4. Una sentencia por tabla (columnas, llaves y CHECK juntos): o se crea
    //    completa o no se crea. Sin charset fijo: hereda el de la base (la
    //    collation de MySQL 8 no existe en MariaDB).
    if (!(await tableExists(queryInterface, "employee_debt_payment"))) {
      await queryInterface.sequelize.query(`
        CREATE TABLE employee_debt_payment (
          id BIGINT NOT NULL AUTO_INCREMENT,
          company_id BIGINT NOT NULL,
          user_id BIGINT NOT NULL,
          amount DECIMAL(10, 2) NOT NULL,
          payment_account_id BIGINT NULL,
          paid_at DATE NOT NULL,
          is_deleted BOOLEAN NOT NULL DEFAULT false,
          created_by BIGINT NULL,
          created_at DATETIME NOT NULL,
          updated_by BIGINT NULL,
          updated_at DATETIME NULL,
          PRIMARY KEY (id),
          KEY idx_employee_debt_payment_company_paid_at (company_id, paid_at),
          KEY idx_employee_debt_payment_user (user_id),
          CONSTRAINT fk_edp_company_id FOREIGN KEY (company_id)
            REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT fk_edp_user_id FOREIGN KEY (user_id)
            REFERENCES user (id) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT fk_edp_payment_account_id FOREIGN KEY (payment_account_id)
            REFERENCES general_variable (id) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT chk_employee_debt_payment_amount CHECK (amount > 0)
        ) ENGINE = InnoDB
      `);
    }

    if (!(await tableExists(queryInterface, "employee_debt_payment_allocation"))) {
      await queryInterface.sequelize.query(`
        CREATE TABLE employee_debt_payment_allocation (
          id BIGINT NOT NULL AUTO_INCREMENT,
          company_id BIGINT NOT NULL,
          employee_debt_payment_id BIGINT NOT NULL,
          employee_debt_id BIGINT NOT NULL,
          amount DECIMAL(10, 2) NOT NULL,
          created_by BIGINT NULL,
          created_at DATETIME NOT NULL,
          updated_by BIGINT NULL,
          updated_at DATETIME NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_employee_debt_payment_allocation (employee_debt_payment_id, employee_debt_id),
          KEY idx_employee_debt_payment_allocation_debt (employee_debt_id),
          KEY idx_employee_debt_payment_allocation_company (company_id),
          CONSTRAINT fk_edp_allocation_payment_id FOREIGN KEY (employee_debt_payment_id)
            REFERENCES employee_debt_payment (id) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT fk_edp_allocation_debt_id FOREIGN KEY (employee_debt_id)
            REFERENCES employee_debt (id) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT fk_edp_allocation_company_id FOREIGN KEY (company_id)
            REFERENCES company (id) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT chk_employee_debt_payment_allocation_amount CHECK (amount > 0)
        ) ENGINE = InnoDB
      `);
    }

    // 5. Lo ya repuesto, como reposiciones (con su cuenta y fecha).
    await backfillReimbursements(queryInterface, Sequelize);

    // 6. Deudas manuales.
    await prepareManualDebts(queryInterface, Sequelize);
  },

  // Revierte las tablas y columnas nuevas. No vuelve a exigir la compra en
  // employee_debt ni quita "cancelled": con deudas manuales registradas eso
  // fallaría (o borraría datos).
  async down(queryInterface) {
    for (const column of ["origin", "description", "category", "incurred_at"]) {
      if (await columnExists(queryInterface, "employee_debt", column)) {
        await queryInterface.removeColumn("employee_debt", column);
      }
    }
    if (await columnExists(queryInterface, "employee_debt", "business_unit_id")) {
      await queryInterface.removeConstraint("employee_debt", "fk_employee_debt_business_unit_id");
      await queryInterface.removeColumn("employee_debt", "business_unit_id");
    }
    if (await tableExists(queryInterface, "employee_debt_payment_allocation")) {
      await queryInterface.dropTable("employee_debt_payment_allocation");
    }
    if (await tableExists(queryInterface, "employee_debt_payment")) {
      await queryInterface.dropTable("employee_debt_payment");
    }
    if (await columnExists(queryInterface, "quotation_expense", "payment_account_id")) {
      await queryInterface.removeConstraint("quotation_expense", "fk_quotation_expense_payment_account_id");
      await queryInterface.removeColumn("quotation_expense", "payment_account_id");
    }
  },
};
