import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { ProductPartialAttributes } from "../../model/product.model";

const updateProductById = async ({
  product,
  productId,
  updatedBy,
}: {
  product: ProductPartialAttributes;
  productId: number;
  updatedBy?: number;
}) => {
  // Whitelist explícita — nunca `{...product}` directo: sin esto, el dueño
  // de un producto propio podía mandar `company_id` en el body de
  // `PUT /product/update/:id` y mover el producto (con su catálogo de
  // precios) a otra empresa.
  const safePayload = {
    name: product.name,
    description: product.description,
    sku: product.sku,
    price_unit: product.price_unit,
    price_hundred: product.price_hundred,
    price_half_thousand: product.price_half_thousand,
    price_thousand: product.price_thousand,
  };

  return DataBase.instance.product.update(
    { ...safePayload, updated_by: updatedBy, updated_at: nowUtc() },
    { where: { id: productId } }
  );
};

export { updateProductById };
