import { NextFunction, Request, Response } from "express";
import {
  addDaysToDateOnly,
  formatDateOnlyEsPe,
  formatInstantDateEsPe,
  toBusinessDateOnly,
} from "../src/utils/dateUtils";
import { hasValidImageSignature } from "../src/middlewares/upload-image";
import { requireCronSecret } from "../src/core/middlewares/requireCronSecret";
import { AppError } from "../src/core/errors/AppError";
import { assertProductionEnv } from "../src/config/validateEnv";
import { resolveCorsOptions, resolvePort } from "../src/config/runtime";

const { normalizeDdl } = require("../scripts/lib/production-sql") as { normalizeDdl: (ddl: string) => string };

// Pruebas unitarias (sin servidor) de la lógica que se agregó para producción.

describe("Fechas en la zona del negocio (America/Lima)", () => {
  it("formatea un DATEONLY sin correrlo de día", () => {
    // Antes: new Date("2026-10-22").toLocaleDateString() en Lima -> 21/10.
    expect(formatDateOnlyEsPe("2026-10-22")).toBe("22/10/2026");
    expect(formatDateOnlyEsPe(new Date("2026-10-22T00:00:00Z"))).toBe("22/10/2026");
  });

  it("una emisión a las 9:30 p. m. de Lima cuenta como ese día, no el siguiente (UTC)", () => {
    const issuedAt = new Date("2026-10-18T02:30:00Z"); // 17/10 21:30 en Lima
    expect(toBusinessDateOnly(issuedAt)).toBe("2026-10-17");
    expect(formatInstantDateEsPe(issuedAt)).toBe("17/10/2026");
  });

  it("suma días a un DATEONLY cruzando meses, años y bisiestos", () => {
    expect(addDaysToDateOnly("2026-10-17", 5)).toBe("2026-10-22");
    expect(addDaysToDateOnly("2026-12-29", 5)).toBe("2027-01-03");
    expect(addDaysToDateOnly("2028-02-27", 2)).toBe("2028-02-29");
  });
});

describe("Firma real de las imágenes subidas", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);
  const html = Buffer.from("<html><body>hola</body></html>");

  it("acepta cada formato con su tipo declarado", () => {
    expect(hasValidImageSignature(png, "image/png")).toBe(true);
    expect(hasValidImageSignature(jpeg, "image/jpeg")).toBe(true);
    expect(hasValidImageSignature(webp, "image/webp")).toBe(true);
  });

  it("rechaza contenido que no coincide con el tipo declarado", () => {
    expect(hasValidImageSignature(html, "image/png")).toBe(false);
    expect(hasValidImageSignature(png, "image/jpeg")).toBe(false);
    expect(hasValidImageSignature(png, "image/gif")).toBe(false);
  });
});

describe("Secreto del cron", () => {
  const originalSecret = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  const runWith = (header: string | undefined) => {
    const req = { header: (name: string) => (name.toLowerCase() === "x-cron-secret" ? header : undefined) } as Request;
    let received: unknown = "not-called";
    const next: NextFunction = (err?: unknown) => {
      received = err;
    };
    requireCronSecret(req, {} as Response, next);
    return received;
  };

  it("sin CRON_SECRET configurado queda deshabilitado (404), nunca abierto", () => {
    delete process.env.CRON_SECRET;
    const result = runWith("cualquiera");
    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).status).toBe(404);
  });

  it("rechaza un secreto incorrecto o ausente (401) y acepta el correcto", () => {
    process.env.CRON_SECRET = "secreto-de-prueba-123";
    expect((runWith("otro") as AppError).status).toBe(401);
    expect((runWith(undefined) as AppError).status).toBe(401);
    expect(runWith("secreto-de-prueba-123")).toBeUndefined();
  });
});

describe("Validación de variables de producción", () => {
  const snapshot = { ...process.env };
  afterEach(() => {
    process.env = { ...snapshot };
  });

  const completeProductionEnv = () => {
    process.env.NODE_ENV = "production";
    process.env.PROY_BD = "u123_grulla";
    process.env.PROY_BD_HOST = "127.0.0.1";
    process.env.PROY_BD_USER = "u123_user";
    process.env.PROY_BD_PASS = "clave";
    process.env.SECRET_HIDDEN_KEY = "x".repeat(64);
  };

  it("no exige nada fuera de producción", () => {
    process.env.NODE_ENV = "development";
    delete process.env.SECRET_HIDDEN_KEY;
    expect(() => assertProductionEnv()).not.toThrow();
  });

  it("en producción se niega a arrancar si falta algo, listándolo", () => {
    completeProductionEnv();
    delete process.env.PROY_BD_PASS;
    delete process.env.SECRET_HIDDEN_KEY;
    expect(() => assertProductionEnv()).toThrow(/PROY_BD_PASS[\s\S]*SECRET_HIDDEN_KEY/);
  });

  it("en producción rechaza una clave JWT corta", () => {
    completeProductionEnv();
    process.env.SECRET_HIDDEN_KEY = "corta";
    expect(() => assertProductionEnv()).toThrow(/al menos 32 caracteres/);
  });

  it("arranca con la configuración completa", () => {
    completeProductionEnv();
    expect(() => assertProductionEnv()).not.toThrow();
  });
});

describe("CORS y puerto según el entorno", () => {
  const snapshot = { ...process.env };
  afterEach(() => {
    process.env = { ...snapshot };
  });

  const checkOrigin = (origin: string | undefined): boolean => {
    const options = resolveCorsOptions();
    if (typeof options.origin !== "function") return options.origin === true;
    let allowed = false;
    options.origin(origin, (_err, result) => {
      allowed = result === true;
    });
    return allowed;
  };

  it("en producción solo deja pasar los orígenes configurados", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "https://app.ejemplo.com, https://otro.ejemplo.com/";
    expect(checkOrigin("https://app.ejemplo.com")).toBe(true);
    expect(checkOrigin("https://otro.ejemplo.com")).toBe(true);
    expect(checkOrigin("https://malicioso.com")).toBe(false);
    expect(checkOrigin(undefined)).toBe(true); // mismo dominio / sin cabecera Origin
  });

  it("en desarrollo mantiene CORS abierto (Vite en otro puerto)", () => {
    process.env.NODE_ENV = "development";
    expect(checkOrigin("http://localhost:4250")).toBe(true);
  });

  it("usa el PORT que inyecta el hosting antes que PROY_APP_PORT", () => {
    process.env.PORT = "3000";
    process.env.PROY_APP_PORT = "4750";
    expect(resolvePort()).toBe(3000);
    delete process.env.PORT;
    expect(resolvePort()).toBe(4750);
  });
});

describe("SQL de producción compatible con MariaDB", () => {
  it("reemplaza colaciones exclusivas de MySQL 8 y quita AUTO_INCREMENT", () => {
    const ddl =
      "CREATE TABLE `t` (`a` varchar(10) COLLATE utf8mb4_0900_ai_ci) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci";
    const meta = "CREATE TABLE `SequelizeMeta` (`name` varchar(255)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci";

    expect(normalizeDdl(ddl)).not.toMatch(/0900|AUTO_INCREMENT=/);
    expect(normalizeDdl(ddl)).toContain("utf8mb4_unicode_ci");
    expect(normalizeDdl(meta)).not.toMatch(/utf8mb3/);
  });
});
