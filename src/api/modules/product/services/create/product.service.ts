import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { ProductAttributes } from "../../model/product.model";

export type CreateProductDto = Pick<
  ProductAttributes,
  "company_id" | "name" | "description" | "sku" | "price_unit" | "price_hundred" | "price_half_thousand" | "price_thousand"
> & { requires_customization?: boolean };

const createProduct = async ({
  product,
  createdBy,
}: {
  product: CreateProductDto;
  createdBy?: number;
}) => {
  // Lista blanca explícita — nunca `...product` directo: el body podía
  // traer `id`, `is_deleted` o columnas de auditoría.
  return DataBase.instance.product.create({
    id: 0,
    company_id: product.company_id,
    name: product.name,
    description: product.description ?? null,
    // "" (campo vacío) se guarda como null: sin SKU.
    sku: product.sku || null,
    price_unit: product.price_unit ?? null,
    price_hundred: product.price_hundred ?? null,
    price_half_thousand: product.price_half_thousand ?? null,
    price_thousand: product.price_thousand ?? null,
    // Apagado por defecto (decisión del usuario): la mayoría no se personaliza.
    requires_customization: product.requires_customization ?? false,
    is_deleted: false,
    created_by: createdBy ?? null,
    created_at: nowUtc(),
    updated_by: null,
    updated_at: null,
  });
};

export { createProduct };
