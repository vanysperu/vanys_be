"use strict";

// Marca Vanys (pedido explícito del usuario: "el color por defecto es azul y
// naranja"). La paleta por defecto sigue siendo el código "blue" (es el
// default de company.theme_color y tiene FK a themes.code), pero ahora con
// el azul marino de Vanys, medido de los píxeles del logo oficial.
//
// El naranja de marca no vive en esta tabla: es el acento fijo del menú y de
// los botones de marca (tokens --sidebar-accent / --brand-orange en
// grulla_fe/src/index.css). Esta fila define el color principal (botones,
// enlaces y encabezados del PDF de cotización).
const VANYS = {
  name: "Vanys — azul y naranja (por defecto)",
  primary_color: "#002E77",
  primary_active_color: "#001D52",
  primary_light_color: "#E6ECF7",
  primary_clarity_color: "rgba(0,46,119,0.2)",
  primary_inverse_color: "#FFFFFF",
};

// Valores anteriores (seed-themes.js), para poder revertir.
const PREVIOUS_BLUE = {
  name: "Azul (por defecto)",
  primary_color: "#1B84FF",
  primary_active_color: "#056EE9",
  primary_light_color: "#E9F3FF",
  primary_clarity_color: "rgba(27,132,255,0.2)",
  primary_inverse_color: "#FFFFFF",
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkUpdate("themes", VANYS, { code: "blue" });
  },

  async down(queryInterface) {
    await queryInterface.bulkUpdate("themes", PREVIOUS_BLUE, { code: "blue" });
  },
};
