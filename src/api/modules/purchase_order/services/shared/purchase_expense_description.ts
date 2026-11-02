// Descripción del gasto que genera una compra: "Compra: <producto> x<cant>"
// + nota de compra adicional si superó lo pedido + " — <notas>" (lo que la
// persona escribió al registrarla). Única fuente del formato, la usan crear y
// corregir una compra.
const NOTES_SEPARATOR = " — ";

export function buildPurchaseExpenseDescription(productName: string, quantity: number, extraQuantity: number, notesSuffix = ""): string {
  const extraNote = extraQuantity > 0 ? ` (compra adicional: ${extraQuantity} por encima de lo pedido)` : "";
  return `Compra: ${productName} x${quantity}${extraNote}${notesSuffix}`;
}

// Parte opcional " (compra adicional: N por encima de lo pedido)" que agrega
// buildPurchaseExpenseDescription.
const EXTRA_NOTE_PATTERN = " \\(compra adicional: \\d+ por encima de lo pedido\\)";

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Las notas de la compra no tienen columna propia: viven en el gasto, después
 * del prefijo "Compra: <producto> x<cant>[ (compra adicional…)]". Al corregir
 * la cantidad se conservan tal cual.
 *
 * El nombre del producto puede contener " — ", así que NO se corta en el
 * primer separador: se quita primero el prefijo que se regenera con el
 * producto actual y recién lo que sigue es el sufijo de notas. Si el producto
 * se renombró desde que se registró la compra (el prefijo ya no coincide), se
 * acepta cualquier producto y se corta en el primer "x<cant>" que cierra el
 * prefijo.
 */
export function purchaseNotesSuffix(description: string, productName: string): string {
  const withKnownProduct = new RegExp(
    `^Compra: ${escapeRegExp(productName)} x\\d+(?:${EXTRA_NOTE_PATTERN})?(${NOTES_SEPARATOR}[\\s\\S]*)?$`
  ).exec(description);
  if (withKnownProduct) return withKnownProduct[1] ?? "";

  const withAnyProduct = new RegExp(`^Compra: [\\s\\S]*? x\\d+(?:${EXTRA_NOTE_PATTERN})?(${NOTES_SEPARATOR}[\\s\\S]*)?$`).exec(description);
  return withAnyProduct?.[1] ?? "";
}

export function notesToSuffix(notes: string | null | undefined): string {
  return notes ? `${NOTES_SEPARATOR}${notes}` : "";
}
