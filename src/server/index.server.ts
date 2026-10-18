import express, { Router, Application, Response, Request, NextFunction } from "express";

import passport from "passport";
import morgan from "morgan";
import cors from "cors";
import http from "http";

import passportMiddleware from "../middlewares/passport";

import {
  protectedRouter as protectedRouterAuth,
  unprotectedRouter as unprotectedRouterAuth,
} from "../api/modules/auth/routes/auth.route";

import { router as UserRoutes } from "../api/modules/users/routes/user.routes";
import { router as RoleRoutes } from "../api/modules/role/routes/role.routes";
import { router as ModuleRoutes } from "../api/modules/module/routes/module.routes";
import { router as ResourceRoutes } from "../api/modules/resource/routes/resource.routes";
import { router as RolesResourcesRoutes } from "../api/modules/roles_resources/routes/roles_resources.routes";
import { router as AccessRoutes } from "../api/modules/access/routes/access.routes";
import { router as CompanyRoutes } from "../api/modules/company/routes/company.routes";
import { router as BusinessUnitRoutes } from "../api/modules/business_unit/routes/business_unit.routes";
import { authenticateJwt } from "../middlewares/passport-auth";
import { requirePasswordChanged } from "../middlewares/require-password-changed";
import { errorHandler } from "../core/middlewares/errorHandler";
import { AppError } from "../core/errors/AppError";
import { router as VariableGeneralRoutes } from "../api/modules/variable_general/routes/variable_general.routes";
import { router as ThemeRoutes } from "../api/modules/theme/routes/theme.routes";
import { router as ClientRoutes } from "../api/modules/client/routes/client.routes";
import { router as ProductRoutes } from "../api/modules/product/routes/product.routes";
import { router as CustomizationTechniqueRoutes } from "../api/modules/customization_technique/routes/customization_technique.routes";
import { router as QuotationRoutes } from "../api/modules/quotation/routes/quotation.routes";
import { router as PurchaseOrderRoutes } from "../api/modules/purchase_order/routes/purchase_order.routes";
import { router as CashMovementRoutes } from "../api/modules/cash_movement/routes/cash_movement.routes";
import { router as PaymentRoutes } from "../api/modules/payment/routes/payment.routes";
import { router as EmployeeDebtRoutes } from "../api/modules/employee_debt/routes/employee_debt.routes";
import { router as ReceivableRoutes } from "../api/modules/receivable/routes/receivable.routes";
import { router as ReminderRoutes } from "../api/modules/reminder/routes/reminder.routes";
import { router as UploadsRoutes } from "../api/modules/uploads/routes/uploads.routes";
import { serveCompanyAssetController } from "../api/modules/uploads/controllers/uploads.controller";
import path from "path";
import { securityHeaders } from "../core/middlewares/securityHeaders";
import { requireCronSecret } from "../core/middlewares/requireCronSecret";
import { expireQuotationsJobController } from "../api/modules/quotation/controllers/jobs.controller";
import {
  isProduction,
  resolveCorsOptions,
  resolveFrontendDistDir,
  resolveTrustProxy,
} from "../config/runtime";
import { DataBase } from "../database";

// Ningún endpoint recibe archivos por JSON (las imágenes van por multipart
// con multer, con su propio tope de 2 MB). Antes el límite era 350 MB: un
// solo request podía tumbar la memoria del proceso en un hosting compartido.
const JSON_BODY_LIMIT = "2mb";

// Los assets de Vite llevan hash en el nombre (index-a1b2c3.js): cambian de
// nombre con cada build, así que se cachean "para siempre".
const FRONTEND_ASSETS_CACHE_MAX_AGE = "365d";

export default class Server {
  public _app: Application;
  private _port: number;
  private _router: Router;
  private _http: http.Server;

  constructor(port: number) {
    this._app = express();
    this._router = Router();
    this._port = port;
    this._http = http.createServer(this._app);

    this.middlewares();
    this.routes();
    this.errors();
  }

  static init(port: number): Server {
    return new Server(port);
  }

  routes(): void {
    // Público, sin token: una imagen referenciada en un <img src> o en el
    // PDF de una cotización no manda cabecera Authorization — servirla acá
    // afuera del router protegido es lo mismo que cualquier archivo
    // estático de un sitio (logo, QR de pago), no expone datos sensibles.
    // Las imágenes viven en la base (company_asset); la URL pública es la
    // misma que cuando estaban en disco.
    this._app.get("/uploads/company-assets/:companyId/:fileName", serveCompanyAssetController);
    this._app.use("/uploads", (_req: Request, res: Response) => {
      res.status(404).end();
    });

    this._app.use("/api", this._router);

    // Publico
    this._router.use("/", unprotectedRouterAuth);

    this._router.get("/version", (req: Request, res: Response) => {
      res.json({ version: "1" });
    });

    // Tareas programadas disparadas por el cron del hosting — autenticadas
    // con un secreto compartido, no con sesión (ver requireCronSecret).
    this._router.post("/internal/jobs/expire-quotations", requireCronSecret, expireQuotationsJobController);

    // Chequeo de salud para el panel del hosting / monitoreo externo: además
    // de "el proceso responde", confirma que la base de datos contesta.
    this._router.get("/health", async (_req: Request, res: Response) => {
      try {
        await DataBase.instance.sequelize.authenticate();
        res.json({ success: true, data: { status: "ok", database: "ok" } });
      } catch {
        res.status(503).json({ success: false, message: "La base de datos no responde", code: "DB_UNAVAILABLE" });
      }
    });

    // Requiere Token
    this._router.use(authenticateJwt);

    // Routes
    this._router.use("/", protectedRouterAuth);

    // Bloquea todo lo demás mientras el usuario tenga una contraseña
    // temporal pendiente de cambio (ver requirePasswordChanged).
    this._router.use(requirePasswordChanged);

    this._router.use("/user", UserRoutes);
    this._router.use("/role", RoleRoutes);
    this._router.use("/module", ModuleRoutes);
    this._router.use("/resource", ResourceRoutes);
    this._router.use("/", RolesResourcesRoutes);
    this._router.use("/access", AccessRoutes);
    this._router.use("/company", CompanyRoutes);
    this._router.use("/business-unit", BusinessUnitRoutes);
    this._router.use("/variable_general", VariableGeneralRoutes);
    this._router.use("/theme", ThemeRoutes);
    this._router.use("/client", ClientRoutes);
    this._router.use("/product", ProductRoutes);
    this._router.use("/customization-technique", CustomizationTechniqueRoutes);
    this._router.use("/quotation", QuotationRoutes);
    this._router.use("/purchase-order", PurchaseOrderRoutes);
    this._router.use("/cash-movement", CashMovementRoutes);
    this._router.use("/payment", PaymentRoutes);
    this._router.use("/employee-debt", EmployeeDebtRoutes);
    this._router.use("/receivable", ReceivableRoutes);
    this._router.use("/reminder", ReminderRoutes);
    this._router.use("/uploads", UploadsRoutes);

    this.frontend();
  }

  // Si hay un build del frontend disponible (ver resolveFrontendDistDir),
  // esta misma app lo sirve: un solo despliegue en el hosting, un solo
  // dominio, y el frontend llama a "/api" en su propio origen (sin CORS).
  // Se monta DESPUÉS de /api y /uploads para no tapar ninguna ruta real.
  private frontend(): void {
    const distDir = resolveFrontendDistDir();
    if (!distDir) return;

    this._app.use(
      "/assets",
      express.static(path.join(distDir, "assets"), {
        index: false,
        fallthrough: false,
        immutable: true,
        maxAge: FRONTEND_ASSETS_CACHE_MAX_AGE,
      })
    );

    // index.html y config.js NUNCA se cachean: son los que apuntan a los
    // assets del build actual, y si quedaran en caché el usuario seguiría
    // viendo la versión anterior después de cada despliegue.
    this._app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res) => res.setHeader("Cache-Control", "no-cache"),
      })
    );

    // Fallback de SPA (React Router con BrowserRouter): cualquier navegación
    // a una ruta del frontend (/cotizaciones, /caja...) devuelve index.html.
    // Solo para pedidos de página (sin extensión y que aceptan HTML): un
    // asset inexistente responde 404 en vez de un HTML engañoso con 200.
    const indexFile = path.join(distDir, "index.html");
    this._app.get(/^\/(?!api\/|uploads\/).*/, (req: Request, res: Response, next: NextFunction) => {
      if (path.extname(req.path) || !req.accepts("html")) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(indexFile);
    });
  }

  middlewares(): void {
    this._app.disable("x-powered-by");
    this._app.set("trust proxy", resolveTrustProxy());

    this._app.use(securityHeaders);
    this._app.use(cors(resolveCorsOptions()));
    // "combined" (formato Apache, con IP y user-agent) es lo útil para
    // revisar incidentes en producción; "dev" es el coloreado para consola.
    this._app.use(morgan(isProduction() ? "combined" : "dev"));
    this._app.use(express.json({ limit: JSON_BODY_LIMIT }));
    this._app.use(express.urlencoded({ limit: JSON_BODY_LIMIT, extended: true }));

    this._router.use(passport.initialize());
    passport.use(passportMiddleware);
  }

  errors(): void {
    this._router.use((req: Request, res: Response, next: NextFunction) => {
      next(new AppError(404, `No se encontró la ruta ${req.originalUrl}`, undefined, "NOT_FOUND"));
    });

    // Único middleware de errores de toda la app (CLAUDE.md sección 5),
    // montado UNA sola vez, al final del pipeline, después de todos los
    // routers.
    this._router.use(errorHandler);
  }

  start(callback: () => void): void {
    this._http.listen(this._port, callback);
  }

  // Deja de aceptar conexiones nuevas y espera a que terminen las que están
  // en curso (ej. un PDF a medio generar) antes de que el proceso se apague.
  stop(): Promise<void> {
    return new Promise((resolve) => this._http.close(() => resolve()));
  }
}
