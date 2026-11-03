// Deja solo los dígitos del celular, como lo guarda el módulo de clientes
// (6–9 dígitos). Si viene con el código de país de Perú (+51 / 0051) y un
// número de 9 dígitos, se quita el código: "+51 987 654 321" -> "987654321".
// Si el valor no es texto, se devuelve tal cual para que el validator lo
// rechace con su mensaje.
export const normalizePeruvianPhone = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const digits = value.replace(/\D/g, "");
  const withoutCountryCode = digits.replace(/^(00)?51(?=\d{9}$)/, "");
  return withoutCountryCode;
};
