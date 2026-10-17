"use strict";

// El sidebar del frontend usa `resource.icon` para cada vista del menú, pero
// todas las vistas se sembraron con icon: null en los seeders anteriores
// (solo los módulos tenían icono) — el usuario reportó que el menú "enreda"
// porque cada vista termina mostrando el mismo ícono genérico de respaldo.
// Esta seeder solo actualiza el campo `icon` de vistas ya existentes, no
// crea recursos nuevos.
const ICON_BY_RESOURCE_ID = {
  1: "profile-circle", // Listado de usuarios
  10: "shield-tick", // Roles y accesos
  26: "setting-2", // Variables generales
  41: "building", // Empresas
  42: "shop", // Tiendas
  50: "profile-user", // Clientes
  60: "box", // Productos
  65: "color-swatch", // Técnicas de personalización
  70: "document", // Cotizaciones
  80: "flag", // Etapas de producción
};

module.exports = {
  async up(queryInterface) {
    for (const [id, icon] of Object.entries(ICON_BY_RESOURCE_ID)) {
      await queryInterface.bulkUpdate("resources", { icon }, { id: Number(id) });
    }
  },

  async down(queryInterface) {
    const ids = Object.keys(ICON_BY_RESOURCE_ID).map(Number);
    await queryInterface.bulkUpdate("resources", { icon: null }, { id: ids });
  },
};
