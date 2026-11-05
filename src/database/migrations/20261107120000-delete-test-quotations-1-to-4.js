"use strict";

// Borra POR COMPLETO las cotizaciones de prueba COT-0001, COT-0002, COT-0003 y
// COT-0004 de la empresa 1 y todo lo que generaron (pedido explícito del usuario: "fueron de
// pruebas y generaron órdenes de compra y pagos, elimínalos todo"). Es un
// borrado físico a propósito, la única excepción a la regla de soft-delete.
//
// Se borra, de hijos a padres:
//   - ajustes de caja y correcciones de dinero de esos pagos/gastos/compras
//   - facturas (y su archivo guardado en el sistema; lo copiado a Google
//     Drive NO se toca: el sistema nunca borra nada en Drive)
//   - deudas del personal nacidas de esas compras y sus pagos (si un pago
//     cubría además otras deudas, solo se le descuenta la parte de estas)
//   - compras, items y órdenes de compra
//   - movimientos manuales de Caja vinculados a esas cotizaciones/órdenes
//   - gastos, pagos, historial, items y la cotización
//
// Todo en UNA transacción: si algo falla, no se borra nada.
const TEST_QUOTATION_IDS = [1, 2, 3, 4];
// Solo si son de la empresa 1 (dato del usuario): si en alguna base esos
// números fueran de otra empresa, no se tocan.
const TEST_COMPANY_ID = 1;

// MySQL no acepta "IN ()": una lista vacía se reemplaza por un id imposible.
const orNone = (list) => (list.length > 0 ? list : [0]);
const idsOf = (rows, key = "id") => [...new Set(rows.map((row) => Number(row[key])))];

module.exports = {
  async up(queryInterface, Sequelize) {
    const { sequelize } = queryInterface;

    await sequelize.transaction(async (transaction) => {
      const select = (sql, replacements) =>
        sequelize.query(sql, { replacements, transaction, type: Sequelize.QueryTypes.SELECT });
      const run = (sql, replacements) => sequelize.query(sql, { replacements, transaction });

      const quotations = idsOf(await select("SELECT id FROM quotation WHERE id IN (:ids) AND company_id = :companyId", {
          ids: TEST_QUOTATION_IDS,
          companyId: TEST_COMPANY_ID,
        }));
      if (quotations.length === 0) return;

      const items = idsOf(await select("SELECT id FROM quotation_item WHERE quotation_id IN (:q)", { q: quotations }));
      const orders = idsOf(await select("SELECT id FROM purchase_order WHERE quotation_id IN (:q)", { q: quotations }));
      const orderItems = idsOf(
        await select("SELECT id FROM purchase_order_item WHERE purchase_order_id IN (:o) OR quotation_item_id IN (:i)", {
          o: orNone(orders),
          i: orNone(items),
        })
      );
      const purchases = idsOf(
        await select("SELECT id FROM purchase_order_item_purchase WHERE purchase_order_item_id IN (:oi)", { oi: orNone(orderItems) })
      );
      const payments = idsOf(await select("SELECT id FROM quotation_payment WHERE quotation_id IN (:q)", { q: quotations }));
      const expenses = idsOf(await select("SELECT id FROM quotation_expense WHERE quotation_id IN (:q)", { q: quotations }));
      const cashMovements = idsOf(
        await select("SELECT id FROM cash_movement WHERE quotation_id IN (:q) OR purchase_order_id IN (:o)", {
          q: quotations,
          o: orNone(orders),
        })
      );
      const invoices = idsOf(
        await select("SELECT id FROM invoice WHERE quotation_id IN (:q) OR purchase_id IN (:p)", { q: quotations, p: orNone(purchases) })
      );

      // Deudas del personal (compras pagadas con plata del trabajador) y sus pagos.
      const debts = idsOf(
        await select("SELECT id FROM employee_debt WHERE purchase_order_item_purchase_id IN (:p)", { p: orNone(purchases) })
      );
      const allocations = await select(
        "SELECT employee_debt_payment_id, SUM(amount) AS removed FROM employee_debt_payment_allocation WHERE employee_debt_id IN (:d) GROUP BY employee_debt_payment_id",
        { d: orNone(debts) }
      );
      const touchedDebtPayments = idsOf(allocations, "employee_debt_payment_id");
      const sharedDebtPayments = idsOf(
        await select(
          "SELECT DISTINCT employee_debt_payment_id FROM employee_debt_payment_allocation WHERE employee_debt_payment_id IN (:ep) AND employee_debt_id NOT IN (:d)",
          { ep: orNone(touchedDebtPayments), d: orNone(debts) }
        ),
        "employee_debt_payment_id"
      );
      const debtPaymentsToDelete = touchedDebtPayments.filter((id) => !sharedDebtPayments.includes(id));

      // Correcciones de dinero de todo lo anterior, y los ajustes de caja
      // (asientos de meses cerrados) que las acompañan.
      const sourceMatch = `(source_type = 'quotation_payment' AND source_id IN (:payments))
        OR (source_type = 'quotation_expense' AND source_id IN (:expenses))
        OR (source_type = 'employee_debt' AND source_id IN (:debts))
        OR (source_type = 'employee_debt_payment' AND source_id IN (:debtPayments))
        OR (source_type = 'manual' AND source_id IN (:cashMovements))`;
      const sourceIds = {
        payments: orNone(payments),
        expenses: orNone(expenses),
        debts: orNone(debts),
        debtPayments: orNone(debtPaymentsToDelete),
        cashMovements: orNone(cashMovements),
      };
      const correctionsBySource = idsOf(await select(`SELECT id FROM money_correction WHERE ${sourceMatch}`, sourceIds));
      const adjustmentParents = idsOf(
        await select(
          `SELECT money_correction_id FROM cash_adjustment_entry
           WHERE money_correction_id IN (:mc) OR quotation_id IN (:q) OR purchase_order_id IN (:o) OR ${sourceMatch}`,
          { ...sourceIds, mc: orNone(correctionsBySource), q: quotations, o: orNone(orders) }
        ),
        "money_correction_id"
      );
      const corrections = [...new Set([...correctionsBySource, ...adjustmentParents])];

      // Borrado, de hijos a padres.
      await run("DELETE FROM cash_adjustment_entry WHERE money_correction_id IN (:mc)", { mc: orNone(corrections) });
      await run("DELETE FROM money_correction WHERE id IN (:mc)", { mc: orNone(corrections) });
      await run("DELETE FROM invoice_file WHERE invoice_id IN (:inv)", { inv: orNone(invoices) });
      await run("DELETE FROM invoice WHERE id IN (:inv)", { inv: orNone(invoices) });
      await run("DELETE FROM employee_debt_payment_allocation WHERE employee_debt_id IN (:d)", { d: orNone(debts) });
      // Un pago que también cubría otras deudas se conserva, sin la parte de estas.
      for (const allocation of allocations) {
        const paymentId = Number(allocation.employee_debt_payment_id);
        if (!sharedDebtPayments.includes(paymentId)) continue;
        await run("UPDATE employee_debt_payment SET amount = amount - :removed, updated_at = UTC_TIMESTAMP() WHERE id = :id", {
          removed: allocation.removed,
          id: paymentId,
        });
      }
      await run("DELETE FROM employee_debt_payment WHERE id IN (:ep)", { ep: orNone(debtPaymentsToDelete) });
      await run("DELETE FROM employee_debt WHERE id IN (:d)", { d: orNone(debts) });
      await run("DELETE FROM purchase_order_item_purchase WHERE id IN (:p)", { p: orNone(purchases) });
      await run("DELETE FROM purchase_order_item WHERE id IN (:oi)", { oi: orNone(orderItems) });
      await run("DELETE FROM cash_movement WHERE id IN (:cm)", { cm: orNone(cashMovements) });
      await run("DELETE FROM purchase_order WHERE id IN (:o)", { o: orNone(orders) });
      await run("DELETE FROM quotation_expense WHERE id IN (:e)", { e: orNone(expenses) });
      await run("DELETE FROM quotation_payment WHERE id IN (:pay)", { pay: orNone(payments) });
      await run("DELETE FROM quotation_event WHERE quotation_id IN (:q)", { q: quotations });
      await run("DELETE FROM quotation_item WHERE quotation_id IN (:q)", { q: quotations });
      await run("DELETE FROM quotation WHERE id IN (:q)", { q: quotations });

      console.log(
        `[migración] Cotizaciones de prueba borradas: ${quotations.map((id) => `COT-${String(id).padStart(4, "0")}`).join(", ")} ` +
          `(pagos ${payments.length}, gastos ${expenses.length}, órdenes de compra ${orders.length}, compras ${purchases.length}, ` +
          `facturas ${invoices.length}, deudas del personal ${debts.length}, movimientos de caja ${cashMovements.length}, ` +
          `correcciones ${corrections.length})`
      );
    });
  },

  // Irreversible: los datos borrados no se pueden reconstruir.
  async down() {},
};
