"use strict";

const { tableExists, indexExists } = require("../migration-helpers");

// Auditoría de índices (27-nov-2026, pedido del usuario: "revisa si la base
// tiene todos los índices correctos para que cargue más rápido"). Se revisó
// cada consulta de los listados contra los índices de desarrollo y producción.
//
// Idempotente: no crea un índice si ya existe con ese nombre, ni si otro índice
// ya empieza con las mismas columnas en el mismo orden (sería un duplicado).
const INDEXES = [
  // Cada request con sesión busca su token por uuid (middlewares/passport.ts).
  // Sin este índice recorría la tabla token entera, que crece con cada ingreso.
  { table: "token", name: "uq_token_uuid", fields: ["uuid"], unique: true },
  // Panel principal y lista de Cotizaciones: empresa + ORDER BY status_changed_at,
  // sin filtrar estado (el índice existente tiene el estado en el medio).
  { table: "quotation", name: "idx_quotation_company_status_changed_at", fields: ["company_id", "status_changed_at"] },
  // Gestor limitado a su tienda: tablero por estado y lista.
  { table: "quotation", name: "idx_quotation_store_status_changed", fields: ["business_unit_id", "status", "status_changed_at"] },
  // Listas y buscadores de catálogo (solo los activos, los más nuevos primero).
  { table: "product", name: "idx_product_company_active_created", fields: ["company_id", "is_deleted", "created_at"] },
  { table: "client", name: "idx_client_company_active_created", fields: ["company_id", "is_deleted", "created_at"] },
  {
    table: "customization_technique",
    name: "idx_customization_technique_company_active_created",
    fields: ["company_id", "is_deleted", "created_at"],
  },
  // Historial: por defecto el del propio usuario; "todos" = el de la empresa.
  { table: "log", name: "idx_log_user_created", fields: ["user_id", "created_at"] },
  { table: "log", name: "idx_log_company_created", fields: ["company_id", "created_at"] },
  // Pagos de cada cotización (Por cobrar, Caja, Estadísticas): cubre is_deleted y paid_at.
  {
    table: "quotation_payment",
    name: "idx_quotation_payment_quotation_active_paid",
    fields: ["quotation_id", "is_deleted", "paid_at"],
  },
  { table: "purchase_order", name: "idx_purchase_order_company_created", fields: ["company_id", "created_at"] },
  { table: "invoice", name: "idx_invoice_company_created", fields: ["company_id", "created_at"] },
  // Validación de documento repetido al crear o editar un usuario.
  { table: "user", name: "idx_user_document_number", fields: ["document_number"] },
];

// Columnas de cada índice existente de la tabla, en orden ("a,b,c").
const existingIndexColumns = async (queryInterface, table) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     GROUP BY INDEX_NAME`,
    { replacements: [table] }
  );
  return rows.map((row) => String(row.cols));
};

// Ya cubierto si otro índice tiene exactamente estas columnas o las tiene como prefijo.
const isCovered = (existing, fields) => {
  const wanted = fields.join(",");
  return existing.some((cols) => cols === wanted || cols.startsWith(`${wanted},`));
};

// Un valor repetido haría fallar el UNIQUE (los uuid no deberían repetirse).
const hasDuplicates = async (queryInterface, table, column) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM \`${table}\` GROUP BY \`${column}\` HAVING COUNT(*) > 1 LIMIT 1`
  );
  return rows.length > 0;
};

// Si hubiera uuid repetidos, el índice se crea igual pero sin UNIQUE (y con otro nombre).
const fallbackName = (name) => name.replace(/^uq_/, "idx_");

// Si `column` es de una FK y el único índice que la respalda es `removing`, se
// crea antes un índice simple para la FK (si no, MySQL no deja quitarlo).
const keepForeignKeyIndex = async (queryInterface, table, column, removing) => {
  const [fks] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
     LIMIT 1`,
    { replacements: [table, column] }
  );
  if (fks.length === 0) return;
  const [others] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND SEQ_IN_INDEX = 1 AND INDEX_NAME <> ?
     LIMIT 1`,
    { replacements: [table, column, removing] }
  );
  if (others.length > 0) return;
  await queryInterface.addIndex(table, { fields: [column], name: `idx_${table}_${column}_fk` });
};

module.exports = {
  async up(queryInterface) {
    for (const index of INDEXES) {
      if (!(await tableExists(queryInterface, index.table))) continue;
      if (await indexExists(queryInterface, index.table, index.name)) continue;
      if (isCovered(await existingIndexColumns(queryInterface, index.table), index.fields)) continue;

      const unique = Boolean(index.unique) && !(await hasDuplicates(queryInterface, index.table, index.fields[0]));
      const name = index.unique && !unique ? fallbackName(index.name) : index.name;
      if (await indexExists(queryInterface, index.table, name)) continue;

      await queryInterface.addIndex(index.table, { fields: index.fields, name, unique });
    }
  },

  // Solo quita lo que crea esta migración (por nombre). Ojo: al crear un índice
  // que empieza por la columna de una FK (ej. company_id), MySQL borra solo el
  // índice simple que respaldaba esa FK; para poder quitar el nuestro, primero
  // se vuelve a crear un índice simple para la FK.
  async down(queryInterface) {
    for (const index of [...INDEXES].reverse()) {
      if (!(await tableExists(queryInterface, index.table))) continue;
      const names = index.unique ? [index.name, fallbackName(index.name)] : [index.name];
      for (const name of names) {
        if (!(await indexExists(queryInterface, index.table, name))) continue;
        await keepForeignKeyIndex(queryInterface, index.table, index.fields[0], name);
        await queryInterface.removeIndex(index.table, name);
      }
    }
  },
};
