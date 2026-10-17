"use strict";

// "variable_general" está en orden gramatical español (sustantivo +
// adjetivo). Se renombra la tabla física a "general_variable" (orden
// correcto en inglés). El código de módulo RBAC, la ruta HTTP montada
// (`/variable_general`) y los nombres de archivos/carpeta del módulo se
// mantienen igual a propósito -- son un contrato de API/permisos ya
// seedeado, independiente del nombre de la tabla en la base de datos.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameTable("variable_general", "general_variable");
  },

  async down(queryInterface) {
    await queryInterface.renameTable("general_variable", "variable_general");
  },
};
