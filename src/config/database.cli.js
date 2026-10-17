const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

// Config usado únicamente por sequelize-cli (migraciones/seeders).
// Lee las mismas variables PROY_BD* que usa la app en tiempo de ejecución
// (src/config/environments/), para no duplicar credenciales en dos lugares.
const base = {
  username: process.env.PROY_BD_USER,
  password: process.env.PROY_BD_PASS,
  database: process.env.PROY_BD,
  host: process.env.PROY_BD_HOST,
  port: process.env.PROY_BD_PORT,
  dialect: "mysql",
  // Por defecto sequelize-cli NO trackea qué seeders ya corrieron (solo lo
  // hace con migraciones) — sin esto, `db:seed:all` los re-ejecuta todos
  // cada vez y explota con errores de duplicado. Con esto, queda una tabla
  // `SequelizeData` que lleva el registro, igual que `SequelizeMeta` para
  // migraciones.
  seederStorage: "sequelize",
};

module.exports = {
  development: base,
  production: base,
};
