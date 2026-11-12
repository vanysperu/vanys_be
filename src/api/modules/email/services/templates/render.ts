import { EmailPayloadByTemplate, EmailTemplateName, RenderedEmail } from "../../types/email.types";
import { renderAccountInvitation, renderPasswordChanged, renderPasswordReset } from "./password.templates";
import { renderQuotationEmail } from "./quotation.template";

type Renderers = { [K in EmailTemplateName]: (payload: EmailPayloadByTemplate[K]) => Promise<RenderedEmail> | RenderedEmail };

// Una función por plantilla. Una plantilla nueva se agrega acá y en
// EmailPayloadByTemplate; TypeScript obliga a tener las dos.
const RENDERERS: Renderers = {
  password_reset: renderPasswordReset,
  account_invitation: renderAccountInvitation,
  password_changed: renderPasswordChanged,
  quotation: renderQuotationEmail,
};

export const isKnownTemplate = (template: string): template is EmailTemplateName => template in RENDERERS;

export async function renderEmail<T extends EmailTemplateName>(
  template: T,
  payload: EmailPayloadByTemplate[T]
): Promise<RenderedEmail> {
  const renderer = RENDERERS[template] as (value: EmailPayloadByTemplate[T]) => Promise<RenderedEmail> | RenderedEmail;
  return renderer(payload);
}
