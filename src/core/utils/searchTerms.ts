// Buscador flexible en español (pedido explícito del usuario: "si escribo gorras
// y el producto es gorra, debería salir"). Solo interpreta el texto; mayúsculas
// y acentos ya los ignora la base (collation *_ai_ci / unicode_ci).

export interface SearchTerm {
  // Formas de la palabra que cuentan como coincidencia.
  forms: string[];
  // Igual, más el otro género: "gorras negras" tiene que encontrar el color Negro.
  colorForms: string[];
}

// Palabras que no describen nada: exigirlas dejaría sin resultados "gorra de
// algodón" si el producto se llama "Gorra algodón".
const STOPWORDS = new Set([
  "a", "al", "con", "de", "del", "e", "el", "en", "la", "las", "lo", "los",
  "o", "para", "por", "u", "un", "una", "unas", "unos", "y",
]);

// Tope de palabras: cada una suma condiciones a la consulta.
const MAX_TERMS = 6;
// Por debajo de 3 letras no se quita nada: "gas" no puede volverse "ga".
const MIN_FORM_LENGTH = 3;
// SKU y códigos (GOR-01, A3S) se buscan tal cual: su "s" final no es un plural.
const ONLY_LETTERS = /^\p{L}+$/u;
// El plural en "-es" solo sale de una consonante: colores, botones, relojes, grises.
const CONSONANT_PLURAL = /[lnrdjsy]es$/;

// Se buscan con "contiene": si "gorra" ya coincide, "gorras" sobra en la consulta.
const withoutRedundant = (forms: string[]): string[] => {
  const unique = [...new Set(forms)];
  return unique.filter((form) => !unique.some((other) => other !== form && form.includes(other)));
};

const wordForms = (word: string): string[] => {
  if (!ONLY_LETTERS.test(word) || word.length < MIN_FORM_LENGTH) return [word];

  const derived = [
    word.endsWith("z") ? `${word.slice(0, -1)}ces` : word, // lápiz -> lápices
    word.endsWith("ces") ? `${word.slice(0, -3)}z` : word, // lápices -> lápiz
    word.endsWith("s") ? word.slice(0, -1) : word, // gorras -> gorra
    CONSONANT_PLURAL.test(word) ? word.slice(0, -2) : word, // colores -> color
  ];
  return withoutRedundant([word, ...derived.filter((form) => form.length >= MIN_FORM_LENGTH)]);
};

const otherGender = (form: string): string => {
  if (form.endsWith("a")) return `${form.slice(0, -1)}o`;
  if (form.endsWith("o")) return `${form.slice(0, -1)}a`;
  return form;
};

/**
 * Parte lo que escribió el usuario en palabras: cada una tiene que aparecer, en
 * cualquier orden. Si todo son palabras vacías ("de la") se buscan esas mismas,
 * porque peor que un resultado raro es ignorar lo que escribió.
 */
export const searchTermsOf = (text: string): SearchTerm[] => {
  const words = text.toLocaleLowerCase("es").split(/[\s,;]+/).filter(Boolean);
  const meaningful = words.filter((word) => !STOPWORDS.has(word));
  const chosen = meaningful.length > 0 ? meaningful : words;

  return [...new Set(chosen)].slice(0, MAX_TERMS).map((word) => {
    const forms = wordForms(word);
    // El género solo cuenta para el color: en el nombre "plata" no es "plato".
    return { forms, colorForms: withoutRedundant(forms.flatMap((form) => [form, otherGender(form)])) };
  });
};
