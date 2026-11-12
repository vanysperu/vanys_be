import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { PasswordLinkPurpose } from "../../model/password_reset_token.model";
import { displayNameOf, hashLinkToken } from "./password_link.shared";

export type PasswordLinkState = "valid" | "expired" | "used" | "invalid";

export interface PasswordLinkCheck {
  state: PasswordLinkState;
  purpose: PasswordLinkPurpose | null;
  // Solo con un enlace vigente: para saludar ("Hola Juan") en la pantalla.
  recipientName: string | null;
}

const INVALID: PasswordLinkCheck = { state: "invalid", purpose: null, recipientName: null };

/**
 * Estado de un enlace antes de mostrar el formulario: así la pantalla dice
 * "este enlace venció" en vez de dejar escribir una contraseña que después se
 * rechaza. Quien tiene el enlace ya demostró que recibió el correo, por eso se
 * puede mostrar su nombre.
 */
export async function checkPasswordLink(token: string): Promise<PasswordLinkCheck> {
  const link = await DataBase.instance.password_reset_token.findOne({ where: { token_hash: hashLinkToken(token) } });
  if (!link) return INVALID;
  if (link.used_at) return { state: "used", purpose: link.purpose, recipientName: null };
  if (link.expires_at.getTime() <= nowUtc().getTime()) return { state: "expired", purpose: link.purpose, recipientName: null };

  const user = await DataBase.instance.user.findOne({
    where: { id: link.user_id, is_deleted: false, status: true },
    attributes: ["name", "paternal_lastname", "email"],
  });
  if (!user) return INVALID;

  return { state: "valid", purpose: link.purpose, recipientName: displayNameOf(user) };
}
