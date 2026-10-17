import { ClientStatic } from "../../api/modules/client/model/client.model";
import { ProductStatic } from "../../api/modules/product/model/product.model";
import { CustomizationTechniqueStatic } from "../../api/modules/customization_technique/model/customization_technique.model";
import { QuotationStatic } from "../../api/modules/quotation/model/quotation.model";
import { QuotationItemStatic } from "../../api/modules/quotation/model/quotation_item.model";
import { BusinessUnitStatic } from "../../api/modules/business_unit/models/business_unit.models";

export const quotationAssociations = ({
  client,
  product,
  customization_technique,
  quotation,
  quotation_item,
  business_unit,
}: {
  client: ClientStatic;
  product: ProductStatic;
  customization_technique: CustomizationTechniqueStatic;
  quotation: QuotationStatic;
  quotation_item: QuotationItemStatic;
  business_unit: BusinessUnitStatic;
}): void => {
  client.hasMany(quotation, { foreignKey: "client_id", sourceKey: "id" });
  quotation.belongsTo(client, { foreignKey: "client_id", targetKey: "id" });

  // Para mostrar la tienda (nombre/dirección) en el PDF de la cotización.
  business_unit.hasMany(quotation, { foreignKey: "business_unit_id", sourceKey: "id" });
  quotation.belongsTo(business_unit, { foreignKey: "business_unit_id", targetKey: "id", as: "businessUnit" });

  quotation.hasMany(quotation_item, { foreignKey: "quotation_id", sourceKey: "id", as: "items" });
  quotation_item.belongsTo(quotation, { foreignKey: "quotation_id", targetKey: "id" });

  product.hasMany(quotation_item, { foreignKey: "product_id", sourceKey: "id" });
  quotation_item.belongsTo(product, { foreignKey: "product_id", targetKey: "id", as: "product" });

  customization_technique.hasMany(quotation_item, { foreignKey: "technique_id", sourceKey: "id" });
  quotation_item.belongsTo(customization_technique, {
    foreignKey: "technique_id",
    targetKey: "id",
    as: "technique",
  });
};
