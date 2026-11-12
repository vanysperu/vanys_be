import { PasswordChangedPayload, PasswordLinkPayload, RenderedEmail } from "../../types/email.types";
import { escapeHtml, renderLayout, renderPlainText } from "./layout";

const BRAND = "Vanys";

// "Recupera tu contraseña": el enlace sirve una sola vez y vence pronto.
export function renderPasswordReset(payload: PasswordLinkPayload): RenderedEmail {
  const title = "Recupera tu contraseña";
  const paragraphs = [
    `Hola ${escapeHtml(payload.recipientName)},`,
    "Recibimos un pedido para cambiar la contraseña de tu cuenta. Para elegir una nueva, usa este botón:",
  ];
  return {
    html: renderLayout({
      title,
      paragraphs,
      button: { label: "Elegir nueva contraseña", url: payload.link },
      footnote: `El enlace vence en ${escapeHtml(payload.expiresIn)} y sirve una sola vez. Si no pediste el cambio, ignora este correo: tu contraseña sigue igual.`,
      brandName: BRAND,
    }),
    text: renderPlainText(title, [...paragraphs, `El enlace vence en ${payload.expiresIn} y sirve una sola vez.`], payload.link),
  };
}

// "Activa tu cuenta": invitación para que un usuario nuevo elija su contraseña.
export function renderAccountInvitation(payload: PasswordLinkPayload): RenderedEmail {
  const title = "Activa tu cuenta";
  const paragraphs = [
    `Hola ${escapeHtml(payload.recipientName)},`,
    "Te crearon una cuenta en Vanys. Para entrar, primero elige tu contraseña con este botón:",
  ];
  return {
    html: renderLayout({
      title,
      paragraphs,
      button: { label: "Crear mi contraseña", url: payload.link },
      footnote: `El enlace vence en ${escapeHtml(payload.expiresIn)}. Si venció, pide a tu administrador que te lo vuelva a enviar.`,
      brandName: BRAND,
    }),
    text: renderPlainText(title, [...paragraphs, `El enlace vence en ${payload.expiresIn}.`], payload.link),
  };
}

// Aviso después de cambiar la contraseña (OWASP: avisar sin incluir la clave).
export function renderPasswordChanged(payload: PasswordChangedPayload): RenderedEmail {
  const title = "Tu contraseña cambió";
  const paragraphs = [
    `Hola ${escapeHtml(payload.recipientName)},`,
    `La contraseña de tu cuenta se cambió el <strong>${escapeHtml(payload.changedAt)}</strong> (hora de Lima). Por seguridad, se cerraron las sesiones abiertas.`,
    "Si no fuiste tú, avisa de inmediato al administrador de tu empresa.",
  ];
  return {
    html: renderLayout({ title, paragraphs, brandName: BRAND }),
    text: renderPlainText(title, paragraphs),
  };
}
