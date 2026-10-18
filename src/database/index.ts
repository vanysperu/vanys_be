import { Sequelize } from "sequelize";
import config from "../config/environments";
import { UserFactory, UserStatic } from "../api/modules/users/models/user.model";
import { TokenFactory, TokenStatic } from "../api/modules/token/models/token.model";
import { RoleFactory, RoleStatic } from "../api/modules/role/model/role.model";
import { UserRoleFactory, UserRoleStatic } from "../api/modules/user_role/models/user_role.model";
import { userHasManyTokens } from "./associations/user";
import { UserAndRoleManyToMany } from "./associations/user_role";

import { ModuleFactory, ModuleStatic } from "../api/modules/module/models/module.model";
import { ResourceFactory, ResourceStatic } from "../api/modules/resource/models/resource.model";
import { RolesResourcesFactory, RolesResourcesStatic } from "../api/modules/roles_resources/models/roles_resources.model";
import { moduleHasManyResources } from "./associations/module";
import { resourceHasManyChildren } from "./associations/resource";
import { CompanyFactory, CompanyStatic } from "../api/modules/company/model/company.model";
import {
  BusinessUnitFactory,
  BusinessUnitStatic,
} from "../api/modules/business_unit/models/business_unit.models";
import { companyHasManybusinessUnit } from "./associations/business_unit";
import { businessUnitHasManyUser } from "./associations/business_unit_user";
import { LogFactory, LogStatic } from "../api/modules/logs/model/log.model";
import {
  VariableGeneralFactory,
  VariableGeneralStatic,
} from "../api/modules/variable_general/models/variable_general.model";
import { ThemeFactory, ThemeStatic } from "../api/modules/theme/models/theme.model";
import { ClientFactory, ClientStatic } from "../api/modules/client/model/client.model";
import { ProductFactory, ProductStatic } from "../api/modules/product/model/product.model";
import {
  CustomizationTechniqueFactory,
  CustomizationTechniqueStatic,
} from "../api/modules/customization_technique/model/customization_technique.model";
import { QuotationFactory, QuotationStatic } from "../api/modules/quotation/model/quotation.model";
import { QuotationItemFactory, QuotationItemStatic } from "../api/modules/quotation/model/quotation_item.model";
import { quotationAssociations } from "./associations/quotation";
import { QuotationPaymentFactory, QuotationPaymentStatic } from "../api/modules/quotation/model/quotation_payment.model";
import { QuotationExpenseFactory, QuotationExpenseStatic } from "../api/modules/quotation/model/quotation_expense.model";
import { QuotationEventFactory, QuotationEventStatic } from "../api/modules/quotation/model/quotation_event.model";
import { quotationFlowAssociations } from "./associations/quotation_flow";
import { PurchaseOrderFactory, PurchaseOrderStatic } from "../api/modules/purchase_order/model/purchase_order.model";
import {
  PurchaseOrderItemFactory,
  PurchaseOrderItemStatic,
} from "../api/modules/purchase_order/model/purchase_order_item.model";
import { purchaseOrderAssociations } from "./associations/purchase_order";
import {
  PurchaseOrderItemPurchaseFactory,
  PurchaseOrderItemPurchaseStatic,
} from "../api/modules/purchase_order/model/purchase_order_item_purchase.model";
import { CashMovementFactory, CashMovementStatic } from "../api/modules/cash_movement/model/cash_movement.model";
import { EmployeeDebtFactory, EmployeeDebtStatic } from "../api/modules/employee_debt/model/employee_debt.model";
import { employeeDebtAssociations } from "./associations/employee_debt";
import { ReminderFactory, ReminderStatic } from "../api/modules/reminder/model/reminder.model";
import { CompanyAssetFactory, CompanyAssetStatic } from "../api/modules/uploads/model/company_asset.model";

export class DataBase {
  private static _instance: DataBase;
  public sequelize: Sequelize;
  private _config = config;

  public user: UserStatic;
  public token: TokenStatic;
  public role: RoleStatic;
  public userRole: UserRoleStatic;

  public module: ModuleStatic;
  public resource: ResourceStatic;
  public rolesResources: RolesResourcesStatic;

  public company: CompanyStatic;
  public business_unit: BusinessUnitStatic;

  public log: LogStatic;

  public variable_general: VariableGeneralStatic;

  public theme: ThemeStatic;

  public client: ClientStatic;
  public product: ProductStatic;
  public customization_technique: CustomizationTechniqueStatic;
  public quotation: QuotationStatic;
  public quotation_item: QuotationItemStatic;
  public quotation_payment: QuotationPaymentStatic;
  public quotation_expense: QuotationExpenseStatic;
  public quotation_event: QuotationEventStatic;
  public purchase_order: PurchaseOrderStatic;
  public purchase_order_item: PurchaseOrderItemStatic;
  public purchase_order_item_purchase: PurchaseOrderItemPurchaseStatic;
  public cash_movement: CashMovementStatic;
  public employee_debt: EmployeeDebtStatic;
  public reminder: ReminderStatic;
  public company_asset: CompanyAssetStatic;

  constructor() {
    this.sequelize = new Sequelize(
      this._config.PROY_BD!,
      this._config.PROY_BD_USER!,
      this._config.PROY_BD_PASS,
      {
        host: this._config.PROY_BD_HOST,
        // Sin PROY_BD_PORT, Number(undefined) era NaN y la conexión fallaba
        // con un error poco claro; en un hosting el puerto casi nunca se
        // configura porque siempre es el estándar.
        port: Number(this._config.PROY_BD_PORT) || 3306,
        logging: false,
        dialect: "mysql",
        // Pool chico a propósito: en un hosting compartido el usuario de
        // MySQL tiene un tope bajo de conexiones simultáneas. `acquire`
        // acota cuánto espera un request por una conexión libre antes de
        // fallar, en vez de quedarse colgado.
        pool: {
          max: 5,
          min: 0,
          idle: 10000,
          acquire: 30000,
        },
      }
    );

    this.company = CompanyFactory(this.sequelize);
    this.business_unit = BusinessUnitFactory(this.sequelize);

    this.user = UserFactory(this.sequelize);
    this.token = TokenFactory(this.sequelize);
    this.role = RoleFactory(this.sequelize);
    this.userRole = UserRoleFactory(this.sequelize);

    this.module = ModuleFactory(this.sequelize);
    this.resource = ResourceFactory(this.sequelize);
    this.rolesResources = RolesResourcesFactory(this.sequelize);

    this.log = LogFactory(this.sequelize);

    this.variable_general = VariableGeneralFactory(this.sequelize);

    this.theme = ThemeFactory(this.sequelize);

    this.client = ClientFactory(this.sequelize);
    this.product = ProductFactory(this.sequelize);
    this.customization_technique = CustomizationTechniqueFactory(this.sequelize);
    this.quotation = QuotationFactory(this.sequelize);
    this.quotation_item = QuotationItemFactory(this.sequelize);
    this.quotation_payment = QuotationPaymentFactory(this.sequelize);
    this.quotation_expense = QuotationExpenseFactory(this.sequelize);
    this.quotation_event = QuotationEventFactory(this.sequelize);
    this.purchase_order = PurchaseOrderFactory(this.sequelize);
    this.purchase_order_item = PurchaseOrderItemFactory(this.sequelize);
    this.purchase_order_item_purchase = PurchaseOrderItemPurchaseFactory(this.sequelize);
    this.cash_movement = CashMovementFactory(this.sequelize);
    this.employee_debt = EmployeeDebtFactory(this.sequelize);
    this.reminder = ReminderFactory(this.sequelize);
    this.company_asset = CompanyAssetFactory(this.sequelize);

    this.associations();
    this.connectDb();
  }

  public static get instance(): DataBase {
    return this._instance || (this._instance = new this());
  }

  private connectDb(): void {
    // El esquema (tablas) y los datos base se manejan con migraciones y
    // seeders formales de sequelize-cli (src/database/migrations/ y
    // src/database/seeders/), no con .sync()/seeders manuales aquí.
    // Ver: npx sequelize-cli db:migrate  /  npx sequelize-cli db:seed:all
    this.sequelize
      .authenticate()
      .then(() => {
        console.log("¡Conexión a la base de datos establecida!");
      })
      .catch((err: unknown) => console.log(err));
  }

  private associations(): void {
    userHasManyTokens({ user: this.user, token: this.token });
    UserAndRoleManyToMany({
      user: this.user,
      role: this.role,
      userRole: this.userRole,
    });

    moduleHasManyResources({
      module: this.module,
      resource: this.resource,
    });
    resourceHasManyChildren({ resource: this.resource });

    companyHasManybusinessUnit({
      business_unit: this.business_unit,
      company: this.company,
    });
    businessUnitHasManyUser({
      business_unit: this.business_unit,
      user: this.user,
    });

    quotationAssociations({
      client: this.client,
      product: this.product,
      customization_technique: this.customization_technique,
      quotation: this.quotation,
      quotation_item: this.quotation_item,
      business_unit: this.business_unit,
    });

    quotationFlowAssociations({
      variable_general: this.variable_general,
      quotation_item: this.quotation_item,
      quotation: this.quotation,
      quotation_payment: this.quotation_payment,
      quotation_expense: this.quotation_expense,
      quotation_event: this.quotation_event,
      user: this.user,
    });

    purchaseOrderAssociations({
      company: this.company,
      quotation: this.quotation,
      quotation_item: this.quotation_item,
      quotation_expense: this.quotation_expense,
      purchase_order: this.purchase_order,
      purchase_order_item: this.purchase_order_item,
      purchase_order_item_purchase: this.purchase_order_item_purchase,
      user: this.user,
    });

    employeeDebtAssociations({
      company: this.company,
      user: this.user,
      purchase_order_item_purchase: this.purchase_order_item_purchase,
      employee_debt: this.employee_debt,
    });
  }
}
