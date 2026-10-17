import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { ProductAttributes } from "../../model/product.model";

export type CreateProductDto = Omit<
  ProductAttributes,
  "id" | "is_deleted" | "created_by" | "created_at" | "updated_by" | "updated_at"
>;

const createProduct = async ({
  product,
  createdBy,
}: {
  product: CreateProductDto;
  createdBy?: number;
}) => {
  return DataBase.instance.product.create({
    id: 0,
    ...product,
    is_deleted: false,
    created_by: createdBy ?? null,
    created_at: nowUtc(),
    updated_by: null,
    updated_at: null,
  });
};

export { createProduct };
