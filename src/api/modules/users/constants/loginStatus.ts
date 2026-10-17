import { LoginStatusTypes } from "../types/loginStatus.type";

const LoginStatus: { [key in LoginStatusTypes]: key } = Object.freeze({
  H: "H",
  BIT: "BIT",
  BI: "BI",
} as const);

export { LoginStatus };
