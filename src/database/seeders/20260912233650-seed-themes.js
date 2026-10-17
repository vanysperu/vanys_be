"use strict";

// Debe coincidir exactamente con los bloques CSS precompilados en
// grulla_fe/src/_metronic/assets/sass/theme/_theme-colors.scss y con
// grulla_fe/src/presentation/constants/themeColors.ts — son las 3 fuentes
// de verdad de una misma paleta (DB para el catálogo, SCSS para los
// estados derivados, TS solo para el nombre/swatch mostrado en el select).
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert("themes", [
      {
        code: "blue",
        name: "Azul (por defecto)",
        primary_color: "#1B84FF",
        primary_active_color: "#056EE9",
        primary_light_color: "#E9F3FF",
        primary_clarity_color: "rgba(27,132,255,0.2)",
        primary_inverse_color: "#FFFFFF",
        position: 1,
        active: true,
        created_at: now,
      },
      {
        code: "violet",
        name: "Violeta",
        primary_color: "#7239EA",
        primary_active_color: "#5014D0",
        primary_light_color: "#F8F5FF",
        primary_clarity_color: "rgba(114,57,234,0.2)",
        primary_inverse_color: "#FFFFFF",
        position: 2,
        active: true,
        created_at: now,
      },
      {
        code: "green",
        name: "Verde",
        primary_color: "#17C653",
        primary_active_color: "#0FAE47",
        primary_light_color: "#E9FBF0",
        primary_clarity_color: "rgba(23,198,83,0.2)",
        primary_inverse_color: "#FFFFFF",
        position: 3,
        active: true,
        created_at: now,
      },
      {
        code: "orange",
        name: "Naranja",
        primary_color: "#F1741C",
        primary_active_color: "#D65D0A",
        primary_light_color: "#FFF4E7",
        primary_clarity_color: "rgba(241,116,28,0.2)",
        primary_inverse_color: "#FFFFFF",
        position: 4,
        active: true,
        created_at: now,
      },
      {
        code: "rose",
        name: "Rosa",
        primary_color: "#F8285A",
        primary_active_color: "#D81A48",
        primary_light_color: "#FFEEF1",
        primary_clarity_color: "rgba(248,40,90,0.2)",
        primary_inverse_color: "#FFFFFF",
        position: 5,
        active: true,
        created_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("themes", null, {});
  },
};
