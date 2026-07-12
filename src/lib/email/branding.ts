import { env } from "../env";
import { GDI_COLORS } from "../brand/colors";

/** Shared font stack for HTML emails (Lato with sensible fallbacks). */
export const EMAIL_FONT_FAMILY = "'Lato', 'Segoe UI', Arial, sans-serif";

export function brandLogoUrl(): string {
  const base = env.APP_URL.replace(/\/$/, "");
  return `${base}/brand/gdi-logo.png`;
}

/** Absolute URL for the live deck editor for a QBR cycle. */
export function editorUrl(qbrCycleId: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/qbr/${qbrCycleId}/collaborate`;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] || c,
  );
}

/** GDI logo block for the top of outbound HTML emails. */
export function emailLogoBlock(): string {
  const url = brandLogoUrl();
  return `<div style="margin:0 0 20px;padding-bottom:16px;border-bottom:1px solid ${GDI_COLORS.border}">
    <img src="${escapeHtml(url)}" alt="GDI" width="132" style="display:block;max-width:140px;height:auto;border:0" />
  </div>`;
}

/** Standard HTML email shell — Lato, logo header, GDI brand colors. */
export function wrapEmailHtml(
  title: string,
  body: string,
  locale?: string | null,
): string {
  const lang = locale === "en" ? "en" : "fr";
  const footer =
    lang === "fr"
      ? "Envoyé par GDI BR Creation Agent — répondez à ce courriel pour mettre à jour votre BR."
      : "Sent by GDI BR Creation Agent — reply to this email to update your BR.";
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&amp;display=swap" rel="stylesheet" />
</head>
<body style="font-family:${EMAIL_FONT_FAMILY};color:${GDI_COLORS.text};line-height:1.6;max-width:640px;margin:0 auto;padding:24px 20px;background:${GDI_COLORS.white}">
  ${emailLogoBlock()}
  <h2 style="color:${GDI_COLORS.blue};margin:0 0 12px;font-weight:700;font-size:20px;font-family:${EMAIL_FONT_FAMILY}">${escapeHtml(title)}</h2>
  ${body}
  <hr style="border:none;border-top:1px solid ${GDI_COLORS.border};margin:28px 0 16px"/>
  <p style="font-size:12px;color:${GDI_COLORS.textMuted};margin:0;font-family:${EMAIL_FONT_FAMILY}">${footer}</p>
</body>
</html>`;
}

/** Primary CTA button style for HTML emails. */
export function emailButtonStyle(): string {
  return `display:inline-block;background:${GDI_COLORS.blue};color:${GDI_COLORS.white};text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700;font-family:${EMAIL_FONT_FAMILY}`;
}

/** Live deck editor CTA — hyperlink button, no raw URL in the HTML body. */
export function emailEditorLinkBlock(
  url: string,
  locale?: string | null,
): string {
  const fr = locale === "fr" || !locale;
  const title = fr ? "Éditeur collaboratif" : "Live deck editor";
  const desc = fr
    ? "Collaborez avec l'assistant pour réviser les diapositives et télécharger une présentation mise à jour."
    : "Chat with the assistant to revise slides and download an updated PowerPoint.";
  const btn = fr ? "Ouvrir l'éditeur" : "Open deck editor";
  return `<div style="margin:20px 0;padding:16px;background:${GDI_COLORS.blueTint};border-radius:8px;border:1px solid ${GDI_COLORS.border}">
    <p style="margin:0 0 8px;font-weight:700;color:${GDI_COLORS.blue};font-family:${EMAIL_FONT_FAMILY}">${title}</p>
    <p style="margin:0 0 12px;font-size:13px;color:${GDI_COLORS.textMuted};font-family:${EMAIL_FONT_FAMILY}">${desc}</p>
    <a href="${escapeHtml(url)}" style="${emailButtonStyle()}">${btn}</a>
  </div>`;
}

/** Deck download block — hyperlink button, no raw URL in the body. */
export function emailDeckLinkBlock(downloadUrl: string, label: string): string {
  return `<div style="margin:20px 0;padding:16px;background:${GDI_COLORS.blueTint};border-radius:8px;border:1px solid ${GDI_COLORS.border}">
    <p style="margin:0 0 8px;font-weight:700;color:${GDI_COLORS.blue};font-family:${EMAIL_FONT_FAMILY}">${escapeHtml(label)}</p>
    <p style="margin:0 0 12px;font-size:13px;color:${GDI_COLORS.textMuted};font-family:${EMAIL_FONT_FAMILY}">The PowerPoint is also attached to this email.</p>
    <a href="${escapeHtml(downloadUrl)}" style="${emailButtonStyle()}">Download .pptx</a>
  </div>`;
}

/** Context header box (QBR / Status / Mode) in agent replies. */
export function emailContextHeaderStyle(): string {
  return `border-left:3px solid ${GDI_COLORS.blue};padding:8px 12px;margin:0 0 16px;background:${GDI_COLORS.blueTint};color:${GDI_COLORS.blue};font-size:13px;font-family:${EMAIL_FONT_FAMILY}`;
}
