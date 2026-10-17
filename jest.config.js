/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "tests",
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.test.json" }],
  },
  // Secuencial: todos los tests comparten la misma empresa QA (Acme Corp QA)
  // y sus totales/listados — correr en paralelo haría que un test viera
  // datos a medio crear de otro.
  maxWorkers: 1,
  testTimeout: 20000,
};
