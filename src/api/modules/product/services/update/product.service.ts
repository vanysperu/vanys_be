import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { ProductWriteInput, updateProductRecord } from "../shared/save_product";
import { assertProductImagesEnabled } from "../shared/images";

// Whitelist explícita (ver updateProductRecord): sin ella, el dueño de un
// producto propio podía mandar `company_id` en el body y moverlo (con su
// catálogo de precios) a otra empresa.
const updateProductById = async ({
  product,
  productId,
  updatedBy,
}: {
  product: ProductWriteInput;
  productId: number;
  updatedBy?: number;
}) =>
  DataBase.instance.sequelize.transaction(async (transaction) => {
    const current = await DataBase.instance.product.findOne({
      where: { id: productId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!current) throw new AppError(404, "El producto no existe");

    // Poner o cambiar la foto exige que la empresa tenga habilitadas las
    // fotos; quitarla (null) siempre se puede.
    if (product.image_path) await assertProductImagesEnabled(Number(current.company_id), transaction);

    await updateProductRecord({ product: current, input: product, actorId: updatedBy ?? null, transaction });
    return { id: productId };
  });

export { updateProductById };
