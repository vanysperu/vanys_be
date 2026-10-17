"use strict";

// RBAC para: 1) la pantalla donde una empresa configura su logo/dirección/
// teléfono para el PDF de cotización ("mi empresa", nunca otra — el
// controller ya fuerza company_id desde el token), y 2) el endpoint de
// descarga del PDF en sí, que cuelga del módulo "cotizacion" ya existente
// (mismo alcance que poder ver la cotización, no una acción aparte).
const now = new Date();

const modules = [
  {
    id: 11,
    code: "document_settings",
    name: "Documentos de la empresa",
    description: "Logo, dirección y cuentas de pago que aparecen en el PDF de cotización",
    icon: "file-text",
    position: 11,
    active: true,
    created_at: now,
  },
];

// [id, module_id, parent_id, type, code, name, route, verb, show_in_menu, icon]
const resourceRows = [
  [97, 11, null, "view", "document_settings.view", "Documentos de la empresa", "/configuracion/documentos", null, true, "file-text"],
  [98, 11, 97, "button", "document_settings.update.button", "Actualizar documentos de la empresa", "/company/my-document-settings", "PUT", true],
  [99, 11, 97, "endpoint", "document_settings.get.endpoint", "Obtener documentos de la empresa (API)", "/company/my-document-settings", "GET", true],
  [100, 11, 97, "button", "document_settings.uploadAsset.button", "Subir logo/QR", "/uploads/company-asset", "POST", true],
];

const resources = resourceRows.map(([id, module_id, parent_id, type, code, name, route, verb, show_in_menu, icon]) => ({
  id,
  module_id,
  parent_id,
  type,
  code,
  name,
  description: null,
  route,
  verb,
  icon: icon ?? null,
  show_in_menu,
  position: id,
  active: true,
  created_at: now,
}));

// Resource nuevo pero DENTRO del módulo "cotizacion" (id 7) ya existente,
// no un módulo aparte — descargar el PDF es parte de ver la cotización.
const PDF_RESOURCE = {
  id: 101,
  module_id: 7,
  parent_id: 70,
  type: "endpoint",
  code: "cotizacion.pdf.endpoint",
  name: "Descargar PDF de cotización (API)",
  description: null,
  route: "/quotation/*/pdf",
  verb: "GET",
  icon: null,
  show_in_menu: true,
  position: 101,
  active: true,
  created_at: now,
};

// Documentos de la empresa: solo Administrador (configuración), nunca
// Especialista. El PDF sí lo puede descargar cualquiera que ya pueda ver
// la cotización (mismos roles que ya tenían el endpoint "find").
const ADMIN_ROLE_IDS = [2, 4, 5];
const SPECIALIST_ROLE_IDS = [3];

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("modules", modules);
    await queryInterface.bulkInsert("resources", [...resources, PDF_RESOURCE]);

    const documentSettingsResourceIds = resources.map((resource) => resource.id);
    const adminGrants = ADMIN_ROLE_IDS.flatMap((role_id) =>
      [...documentSettingsResourceIds, PDF_RESOURCE.id].map((resource_id) => ({ role_id, resource_id, created_at: now })),
    );
    const specialistGrants = SPECIALIST_ROLE_IDS.map((role_id) => ({
      role_id,
      resource_id: PDF_RESOURCE.id,
      created_at: now,
    }));

    await queryInterface.bulkInsert("roles_resources", [...adminGrants, ...specialistGrants]);
  },

  async down(queryInterface) {
    const resourceIds = [...resourceRows.map((row) => row[0]), PDF_RESOURCE.id];
    await queryInterface.bulkDelete("roles_resources", { resource_id: resourceIds });
    await queryInterface.bulkDelete("resources", { id: resourceIds });
    await queryInterface.bulkDelete("modules", { id: 11 });
  },
};
