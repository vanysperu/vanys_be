import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { createProductRecord, ProductWriteInput } from "../../../product/services/shared/save_product";

// Ejemplos con los que arranca cada empresa de práctica (modo enseñanza,
// 21-nov): clientes, productos, técnicas y una cuenta bancaria, para poder
// practicar desde el primer minuto. Son datos inventados (correos con dominio
// .ejemplo, que no existe: nunca llega un correo a nadie).

const SAMPLE_CLIENTS = [
  {
    name: "Comercial Los Andes SAC",
    document_type: "6",
    document_number: "20601234567",
    email: "compras@losandes.ejemplo",
    phone: "987654321",
    address: "Av. Los Próceres 123, Lima",
  },
  {
    name: "Colegio San Martín",
    document_type: "6",
    document_number: "20509876543",
    email: "administracion@sanmartin.ejemplo",
    phone: "912345678",
    address: "Jr. Las Flores 456, Lima",
  },
  { name: "Ana Torres", document_type: "1", document_number: "45678912", email: null, phone: "998877665", address: null },
];

// Manejan stock: sin efecto si la empresa no tiene inventario; con inventario,
// la lección de movimientos puede darles ingreso.
const SAMPLE_PRODUCTS: ProductWriteInput[] = [
  {
    name: "Polo de algodón",
    description: "Polo cuello redondo, 100 % algodón",
    sku: "PRAC-POLO",
    price_unit: 18,
    price_hundred: 15,
    price_half_thousand: 13,
    price_thousand: 12,
    requires_customization: true,
    tracks_stock: true,
  },
  {
    name: "Taza de cerámica 11 oz",
    description: "Taza blanca para sublimar",
    sku: "PRAC-TAZA",
    price_unit: 12,
    price_hundred: 9.5,
    requires_customization: true,
    tracks_stock: true,
  },
  {
    name: "Libreta A5",
    description: "Libreta de 80 hojas con tapa dura",
    sku: "PRAC-LIBRETA",
    price_unit: 9,
    price_hundred: 7.5,
    requires_customization: false,
    tracks_stock: true,
  },
];

const SAMPLE_TECHNIQUES = [
  { name: "Bordado", description: "Bordado a máquina, hasta 8 colores", price_unit: 6, price_hundred: 4.5 },
  { name: "Sublimación", description: "Impresión a todo color", price_unit: 4, price_hundred: 3 },
  { name: "Serigrafía", description: "Un color por pasada", price_unit: 3.5, price_hundred: 2.5 },
];

// Un proveedor (lo usan las lecciones de stock de proveedores y compras).
const SAMPLE_SUPPLIER = { name: "Importadora Andina SAC", document_type: 6, document_number: "20501234567" };

// CCI de ejemplo con sus 20 dígitos (mismo formato que una cuenta real).
const SAMPLE_BANK_ACCOUNT = { name: "BCP Soles (práctica)", ref1: "191-0000000-0-00", ref3: "00219100000000000000" };

export const createSampleCatalog = async ({
  companyId,
  storeId,
  actorId,
  transaction,
}: {
  companyId: number;
  storeId: number;
  actorId: number;
  transaction: Transaction;
}): Promise<void> => {
  const now = nowUtc();
  const audit = { created_by: actorId, created_at: now, updated_by: actorId, updated_at: now };

  await DataBase.instance.client.bulkCreate(
    SAMPLE_CLIENTS.map((client) => ({ id: 0, ...client, company_id: companyId, business_unit_id: storeId, is_deleted: false, ...audit })),
    { transaction }
  );
  await DataBase.instance.customization_technique.bulkCreate(
    SAMPLE_TECHNIQUES.map((technique) => ({
      id: 0,
      ...technique,
      price_half_thousand: null,
      price_thousand: null,
      company_id: companyId,
      is_deleted: false,
      ...audit,
    })),
    { transaction }
  );
  // Productos uno por uno: createProductRecord valida el SKU y guarda colores/códigos.
  for (const product of SAMPLE_PRODUCTS) {
    await createProductRecord({ companyId, input: product, actorId, transaction });
  }
  await DataBase.instance.supplier.create(
    {
      id: 0,
      company_id: companyId,
      ...SAMPLE_SUPPLIER,
      trade_name: null,
      email: null,
      phone: null,
      address: null,
      is_carrier: false,
      mtc_registration: null,
      active: true,
      ...audit,
    },
    { transaction }
  );
  await DataBase.instance.variable_general.create(
    {
      id: 0,
      category: "payment_account",
      title: "Cuenta de pago",
      prefix_id: "bank",
      name: SAMPLE_BANK_ACCOUNT.name,
      description: "Cuenta de ejemplo de la empresa de práctica",
      ref1: SAMPLE_BANK_ACCOUNT.ref1,
      ref2: "",
      ref3: SAMPLE_BANK_ACCOUNT.ref3,
      show_in_quotation: true,
      company_id: companyId,
      is_deleted: false,
      ...audit,
    },
    { transaction }
  );
};
