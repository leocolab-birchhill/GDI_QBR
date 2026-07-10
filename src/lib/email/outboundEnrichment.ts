import type { OutboundAttachment } from "./providers/EmailProvider";
import { emailEditorLinkBlock, editorUrl } from "./branding";
import { resolveQbrLocale } from "../i18n";
import { env } from "../env";
import { prisma } from "../db";

const FOOTER_MARKER = '<hr style="border:none;border-top:1px solid';
function insertBeforeFooter(html: string, block: string): string {
  const idx = html.indexOf(FOOTER_MARKER);
  return idx >= 0
    ? `${html.slice(0, idx)}${block}${html.slice(idx)}`
    : `${html}${block}`;
}

/**
 * Append a clean hyperlink to the live deck editor on every outbound BR email.
 * Does not auto-attach .pptx — decks are still attached when explicitly generated.
 */
export async function enrichWithEditorLink(args: {
  qbrCycleId: string;
  text: string;
  html?: string;
  attachments?: OutboundAttachment[];
  locale?: string | null;
}): Promise<{
  text: string;
  html?: string;
  attachments?: OutboundAttachment[];
}> {
  const cycle = await prisma.qbrCycle.findUnique({
    where: { id: args.qbrCycleId },
    include: { account: true },
  });
  const locale = args.locale ?? resolveQbrLocale(cycle ?? undefined);

  const url = editorUrl(args.qbrCycleId);
  const newQbrUrl = `${env.APP_URL.replace(/\/$/, "")}/collaborate`;
  const textLine =
    locale === "fr"
      ? "Ouvrez l'éditeur collaboratif pour réviser les diapositives dans votre navigateur."
      : "Open the live deck editor to revise slides in your browser.";
  const createLine =
    locale === "fr"
      ? `Créer un nouveau client/BR : ${newQbrUrl}`
      : `Create a new client/BR: ${newQbrUrl}`;
  const textUrl = locale === "fr" ? `Éditeur : ${url}` : `Deck editor: ${url}`;

  let text = args.text;
  if (!text.includes(url) && !text.includes("/collaborate")) {
    text = args.html
      ? `${text.trim()}\n\n${textLine}\n${createLine}`
      : `${text.trim()}\n\n${textLine}\n${textUrl}\n${createLine}`;
  }

  let html = args.html;
  if (html && !html.includes(url)) {
    html = insertBeforeFooter(html, emailEditorLinkBlock(url, locale));
  }

  return { text, html, attachments: args.attachments };
}
