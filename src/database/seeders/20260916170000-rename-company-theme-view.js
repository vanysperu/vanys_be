"use strict";

// La vista sembrada como "Apariencia de empresas" (resource id 41) se
// expande a la gestión completa de empresas (crear/editar/deshabilitar, no
// solo el color). Se renombra el `name` visible en el menú; el `route` y el
// `code` quedan igual a propósito, para no romper el matching de rutas del
// front ni requerir tocar roles_resources otra vez.
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkUpdate(
      "resources",
      { name: "Empresas" },
      { id: 41, code: "platform.company.theme.view" }
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkUpdate(
      "resources",
      { name: "Apariencia de empresas" },
      { id: 41, code: "platform.company.theme.view" }
    );
  },
};
