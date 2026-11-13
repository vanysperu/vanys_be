import { Transaction, UniqueConstraintError } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { utcToBusinessParts } from "../../../../../utils/dateUtils";
import type { SupplierModel } from "../../model/supplier.model";
import type { SupplierDto, SupplierInput } from "../../types/supplier.types";

export const toSupplierDto = (supplier: SupplierModel): SupplierDto => ({
  id: Number(supplier.id),
  company_id: Number(supplier.company_id),
  document_type: supplier.document_type === null ? null : Number(supplier.document_type),
  document_number: supplier.document_number,
  name: supplier.name,
  trade_name: supplier.trade_name,
  email: supplier.email,
  phone: supplier.phone,
  address: supplier.address,
  is_carrier: Boolean(supplier.is_carrier),
  mtc_registration: supplier.mtc_registration,
  active: Boolean(supplier.active),
  createdAt: utcToBusinessParts(supplier.created_at),
});

// Campos opcionales vacíos se guardan como null (no como "").
const blankToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

// Solo los campos permitidos del body, ya limpios (nunca el body tal cual).
export const cleanSupplierInput = (input: SupplierInput) => ({
  document_type: input.document_type ?? null,
  document_number: blankToNull(input.document_number),
  name: input.name.trim(),
  trade_name: blankToNull(input.trade_name),
  email: blankToNull(input.email),
  phone: blankToNull(input.phone),
  address: blankToNull(input.address),
  is_carrier: Boolean(input.is_carrier),
  // El registro MTC solo tiene sentido para un transportista.
  mtc_registration: input.is_carrier ? blankToNull(input.mtc_registration) : null,
});

// Los índices únicos (empresa + nombre, empresa + documento) frenan el
// duplicado; acá se traduce a un mensaje claro.
export const rethrowSupplierDuplicate = (error: unknown): never => {
  if (error instanceof UniqueConstraintError) {
    const byDocument = Object.keys(error.fields ?? {}).some((field) => field.includes("document"));
    throw new AppError(
      409,
      byDocument ? "Ya hay un proveedor con ese número de documento" : "Ya hay un proveedor con ese nombre",
      undefined,
      "SUPPLIER_DUPLICATE"
    );
  }
  throw error;
};

// Proveedor de la empresa del usuario (o de cualquiera si es Super
// Administrador). Uno de otra empresa responde 404, sin revelar que existe.
export const findSupplierForCaller = async (id: number, user: IToken, transaction?: Transaction): Promise<SupplierModel> => {
  const supplier = await DataBase.instance.supplier.findByPk(id, { transaction });
  if (!supplier) throw new AppError(404, "El proveedor no existe");
  if (!user.isSystem && Number(supplier.company_id) !== user.companyId) throw new AppError(404, "El proveedor no existe");
  return supplier;
};
