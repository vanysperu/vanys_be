type LoginStatusTypes = "H" | "BI" | "BIT";

const LoginStatusTypesArr: LoginStatusTypes[] = [
  "H",   // Puede iniciar sesión
  "BIT", // Bloqueado temporalmente
  "BI",  // Bloqueado
];

export {
    LoginStatusTypes,
    LoginStatusTypesArr
}
