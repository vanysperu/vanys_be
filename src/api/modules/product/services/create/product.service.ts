import { DataBase } from "../../../../../database";
import { ProductWriteInput, createProductRecord } from "../shared/save_product";
import { assertProductImagesEnabled } from "../shared/images";

export type CreateProductDto = ProductWriteInput & { company_id: number; name: string };

// Producto + colores en una transacción (si fallan los colores, no queda un
// producto a medias). La foto solo se acepta si la empresa tiene habilitadas
// las fotos de productos.
const createProduct = async ({ product, createdBy }: { product: CreateProductDto; createdBy?: number }) =>
  DataBase.instance.sequelize.transaction(async (transaction) => {
    if (product.image_path) await assertProductImagesEnabled(product.company_id, transaction);
    return createProductRecord({
      companyId: product.company_id,
      input: product,
      actorId: createdBy ?? null,
      transaction,
    });
  });

export { createProduct };
