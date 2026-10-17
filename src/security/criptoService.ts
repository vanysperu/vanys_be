import bcrypt from "bcrypt";

const saltRounds = 10;

/**
 * Encripta un valor dado usando bcrypt.
 *
 * @param {string} value - El valor a encriptar.
 * @returns {Promise<{ hash: string; salt: string }>} Un objeto que contiene el hash y el salt.
 */
export async function encrypt(
  value: string
): Promise<{ hash: string; salt: string }> {
  const salt = await bcrypt.genSalt(saltRounds);
  const hash = await bcrypt.hash(value, salt);
  return { hash, salt };
}

/**
 * Verifica si un valor dado, al ser hasheado con el salt proporcionado, coincide con el hash dado.
 *
 * @param {string} value - El valor a verificar.
 * @param {string} salt - salt utilizada para el hash.
 * @param {string} hash - El hash con el cual comparar.
 * @returns {Promise<boolean>} Verdadero si el valor hasheado coincide con el hash dado, de lo contrario falso.
 */
export async function verify(
  value: string,
  salt: string,
  hash: string
): Promise<boolean> {
  const hashedValue = await bcrypt.hash(value, salt);
  return hashedValue === hash;
}
