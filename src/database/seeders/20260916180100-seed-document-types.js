"use strict";

// Tipos de documento como catálogo GLOBAL en general_variable (company_id
// NULL = visible para todas las empresas). Los códigos en `prefix_id` deben
// coincidir exactamente con los que acepta el validador de usuarios
// (createUserDtoValidator / body("document_type").isIn([1,2,3,6])).
const DOCUMENT_TYPES = [
  { prefix_id: "1", name: "DNI" },
  { prefix_id: "2", name: "Pasaporte" },
  { prefix_id: "3", name: "Carné de extranjería (CE)" },
  { prefix_id: "6", name: "RUC" },
];

// Mismo caso que document_type: hoy vive hardcodeado en el front
// (body("gender").isIn([4, 5]) en el validador de usuarios).
const GENDERS = [
  { prefix_id: "4", name: "Masculino" },
  { prefix_id: "5", name: "Femenino" },
];

const globalRows = (category, title, items) =>
  items.map((item) => ({
    category,
    title,
    prefix_id: item.prefix_id,
    name: item.name,
    description: item.name,
    ref1: null,
    ref2: null,
    company_id: null,
  }));

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("general_variable", [
      ...globalRows("document_type", "Tipo de documento", DOCUMENT_TYPES),
      ...globalRows("gender", "Género", GENDERS),
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("general_variable", { category: "document_type", company_id: null });
    await queryInterface.bulkDelete("general_variable", { category: "gender", company_id: null });
  },
};
