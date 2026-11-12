// Diseño común de los correos: HTML simple con tablas y estilos en línea (los
// clientes de correo ignoran las hojas de estilo), más una versión en texto
// plano para los que no muestran HTML.

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface LayoutInput {
  title: string;
  // Párrafos ya escapados (pueden traer <strong>).
  paragraphs: string[];
  button?: { label: string; url: string };
  // Nota chica al final (ya escapada).
  footnote?: string;
  // Quién firma el correo (empresa o "Vanys").
  brandName: string;
}

export function renderLayout({ title, paragraphs, button, footnote, brandName }: LayoutInput): string {
  const body = paragraphs
    .map((paragraph) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937;">${paragraph}</p>`)
    .join("");
  const cta = button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0;"><tr><td style="border-radius:8px;background:#111827;">
         <a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(button.label)}</a>
       </td></tr></table>
       <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#6b7280;">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all;">${escapeHtml(button.url)}</span></p>`
    : "";
  const note = footnote
    ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">${footnote}</p>`
    : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px;">
        <tr><td>
          <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#6b7280;">${escapeHtml(brandName)}</p>
          <h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(title)}</h1>
          ${body}${cta}${note}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Versión de texto plano: los mismos párrafos sin etiquetas.
export function renderPlainText(title: string, paragraphs: string[], link?: string): string {
  const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return [title, "", ...paragraphs.map(strip), ...(link ? ["", link] : [])].join("\n");
}
