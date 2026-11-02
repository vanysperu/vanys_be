import {
  buildPurchaseExpenseDescription,
  notesToSuffix,
  purchaseNotesSuffix,
} from "../src/api/modules/purchase_order/services/shared/purchase_expense_description";

// Función pura (sin base ni servidor): las notas de una compra viven en la
// descripción de su gasto y se tienen que recuperar al corregir la cantidad.
describe("purchaseNotesSuffix", () => {
  it("recupera las notas aunque el producto no las tenga ni lleve ' — '", () => {
    const description = buildPurchaseExpenseDescription("Polo", 5, 0, notesToSuffix("pago contra entrega"));
    expect(purchaseNotesSuffix(description, "Polo")).toBe(" — pago contra entrega");
    expect(purchaseNotesSuffix(buildPurchaseExpenseDescription("Polo", 5, 0), "Polo")).toBe("");
  });

  it("un producto con ' — ' en el nombre no corta las notas por el lado equivocado", () => {
    const product = "Taza — Edición Grande";
    const withNotes = buildPurchaseExpenseDescription(product, 5, 0, notesToSuffix("factura 123"));
    expect(purchaseNotesSuffix(withNotes, product)).toBe(" — factura 123");
    // Sin notas, el ' — ' del nombre NO es un sufijo.
    expect(purchaseNotesSuffix(buildPurchaseExpenseDescription(product, 5, 0), product)).toBe("");
  });

  it("conserva las notas con la nota de compra adicional y con ' — ' dentro de las notas", () => {
    const product = "Taza — Grande";
    const description = buildPurchaseExpenseDescription(product, 12, 2, notesToSuffix("proveedor A — urgente"));
    expect(purchaseNotesSuffix(description, product)).toBe(" — proveedor A — urgente");
  });

  it("si el producto se renombró después, igual recupera las notas", () => {
    const description = buildPurchaseExpenseDescription("Nombre viejo", 3, 0, notesToSuffix("nota"));
    expect(purchaseNotesSuffix(description, "Nombre nuevo")).toBe(" — nota");
  });

  it("un nombre con caracteres especiales de regex no rompe la búsqueda", () => {
    const product = "Bolsa (L) [x2] $5 + extra?";
    const description = buildPurchaseExpenseDescription(product, 4, 0, notesToSuffix("ok"));
    expect(purchaseNotesSuffix(description, product)).toBe(" — ok");
  });
});
