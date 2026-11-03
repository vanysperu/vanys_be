import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { ClientModel } from "../../../client/model/client.model";
import { WebQuoteClientInput } from "../../types/web_quote_request.types";

export interface ResolvedClient {
  client: ClientModel;
  created: boolean;
  warnings: string[];
}

const clean = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};

// Email/documento son únicos por empresa entre clientes activos (mismo
// criterio que client.validator.ts). Si la web manda uno que ya usa OTRO
// cliente, no se rechaza el pedido: el cliente nuevo se crea sin ese dato y
// se avisa en `warnings`.
const isTakenInCompany = async (
  field: "email" | "document_number",
  value: string,
  companyId: number,
  transaction: Transaction
) => {
  const existing = await DataBase.instance.client.findOne({
    where: { [field]: value, company_id: companyId, is_deleted: false },
    attributes: ["id"],
    transaction,
  });
  return existing !== null;
};

// El cliente se identifica por su celular dentro de la empresa de la key
// (pedido explícito del usuario). Si ya existe un cliente activo con ese
// número, se reutiliza tal cual (no se pisan sus datos con lo que mande la
// web). Si no, se crea con lo que llegó: solo el celular es obligatorio; sin
// nombre, se usa "Cliente web <celular>" para que se reconozca en las listas.
export async function resolveWebClient({
  input,
  companyId,
  businessUnitId,
  transaction,
}: {
  input: WebQuoteClientInput;
  companyId: number;
  businessUnitId: number | null;
  transaction: Transaction;
}): Promise<ResolvedClient> {
  const phone = input.phone;

  // Si hubiera más de uno con el mismo celular, se toma el más antiguo
  // (orden estable: el mismo pedido siempre cae en el mismo cliente).
  const existing = await DataBase.instance.client.findOne({
    where: { company_id: companyId, phone, is_deleted: false },
    order: [["id", "ASC"]],
    transaction,
  });
  if (existing) return { client: existing, created: false, warnings: [] };

  const warnings: string[] = [];
  const email = clean(input.email);
  const documentNumber = clean(input.document_number);
  const documentType = clean(input.document_type);

  const emailTaken = email ? await isTakenInCompany("email", email, companyId, transaction) : false;
  if (emailTaken) warnings.push(`El email ${email} ya pertenece a otro cliente: no se guardó en el cliente nuevo`);

  const documentTaken = documentNumber
    ? await isTakenInCompany("document_number", documentNumber, companyId, transaction)
    : false;
  if (documentTaken) {
    warnings.push(`El documento ${documentNumber} ya pertenece a otro cliente: no se guardó en el cliente nuevo`);
  }

  const now = nowUtc();
  const client = await DataBase.instance.client.create(
    {
      id: 0,
      company_id: companyId,
      business_unit_id: businessUnitId,
      name: clean(input.name) ?? `Cliente web ${phone}`,
      // Tipo y número van juntos: si el número no se guarda, el tipo tampoco.
      document_type: documentTaken ? null : documentType,
      document_number: documentTaken ? null : documentNumber,
      email: emailTaken ? null : email,
      phone,
      address: clean(input.address),
      is_deleted: false,
      // Lo crea la integración, no un usuario del sistema.
      created_by: null,
      created_at: now,
      updated_by: null,
      updated_at: now,
    },
    { transaction }
  );

  return { client, created: true, warnings };
}
