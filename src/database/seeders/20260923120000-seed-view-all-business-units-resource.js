"use strict";

// Regla de oro pedida por el usuario: un usuario con tienda asignada
// (business_unit_id) solo ve/crea/modifica clientes, cotizaciones (y por
// herencia sus órdenes de compra) y usuarios de SU tienda — nunca de otra
// tienda de la misma empresa — salvo que su rol tenga este botón otorgado,
// en cuyo caso ve todas las tiendas de su empresa. Un usuario SIN tienda
// asignada (business_unit_id null, ej. un admin de empresa) ya ve todas las
// tiendas automáticamente, sin necesitar este botón (no tiene una tienda
// propia a la cual limitarlo). Vive dentro del módulo "roles_access" (id 2)
// porque es, en esencia, un permiso de acceso más — no una acción de un
// módulo de negocio específico.
const now = new Date();

const resource = {
  id: 110,
  module_id: 2,
  parent_id: 10,
  type: "button",
  code: "roles_access.viewAllBusinessUnits.button",
  name: "Ver todas las tiendas de la empresa",
  description:
    "Sin este permiso, un usuario con tienda asignada solo ve/crea/modifica clientes, cotizaciones y usuarios de su propia tienda.",
  route: null,
  verb: null,
  icon: null,
  show_in_menu: true,
  position: 110,
  active: true,
  created_at: now,
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("resources", [resource]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("roles_resources", { resource_id: resource.id });
    await queryInterface.bulkDelete("resources", { id: resource.id });
  },
};
