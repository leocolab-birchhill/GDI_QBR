/**
 * Plain-text + lightweight HTML email templates.
 * Kept as simple functions (no JSX) so they work in any runtime, including the
 * job runner. Swap for React Email later without changing call sites.
 */

import { EMAIL_FONT_FAMILY, escapeHtml, wrapEmailHtml, emailButtonStyle } from "./branding";

function wrapHtml(title: string, body: string): string {
  return wrapEmailHtml(title, body);
}

function list(items: string[]): string {
  return `<ol>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ol>`;
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export function createQbrConfirmation(args: {
  clientName: string;
  quarter: string;
  year: number;
  missing: string[];
}): EmailContent {
  const subject = `Created: ${args.clientName} ${args.quarter} ${args.year} QBR`;
  const text = `Created: ${args.clientName} ${args.quarter} ${args.year} QBR.

I still need:
${args.missing.map((m, i) => `${i + 1}. ${m}`).join("\n")}

Reply with whatever you know. "Unknown" is fine.`;
  const html = wrapHtml(subject, `<p>Created: <strong>${escapeHtml(args.clientName)} ${args.quarter} ${args.year}</strong> QBR.</p><p>I still need:</p>${list(args.missing)}<p>Reply with whatever you know. "Unknown" is fine.</p>`);
  return { subject, text, html };
}

export function capturedItemsReply(args: { sections: string[] }): EmailContent {
  const subject = "Captured — please review";
  const body = args.sections.join("\n\n");
  const text = `Captured.\n\n${body}\n\nReply APPROVE or send edits.`;
  const html = wrapHtml(
    "Captured",
    `${args.sections.map((s) => `<p>${escapeHtml(s).replace(/\n/g, "<br/>")}</p>`).join("")}<p><strong>Reply APPROVE or send edits.</strong></p>`,
  );
  return { subject, text, html };
}

export function monthlyCheckIn(args: { clientName: string }): EmailContent {
  const subject = `Monthly QBR check-in - ${args.clientName}`;
  const qs = [
    "Any client concerns?",
    "Any open commitments?",
    "Any safety incidents?",
    "Any billing issues?",
    "Any upcoming work before the next QBR?",
  ];
  const text = `Please reply with updates:\n${qs.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
  const html = wrapHtml(subject, `<p>Please reply with updates:</p>${list(qs)}`);
  return { subject, text, html };
}

export function vpSummary(args: { clientName: string; quarter: string; summary: string }): EmailContent {
  const subject = `${args.clientName} ${args.quarter} QBR - one-month preparation summary`;
  const text = args.summary;
  const html = wrapHtml(subject, `<pre style="white-space:pre-wrap;font-family:${EMAIL_FONT_FAMILY}">${escapeHtml(args.summary)}</pre>`);
  return { subject, text, html };
}

function downloadButton(downloadUrl: string, label: string): string {
  return `<p style="margin:16px 0"><a href="${escapeHtml(downloadUrl)}" style="${emailButtonStyle()}">${escapeHtml(label)}</a></p>`;
}

export function draftReady(args: {
  fileName: string;
  unconfirmed: string[];
  downloadUrl?: string;
}): EmailContent {
  const subject = `Draft ready: ${args.fileName}`;
  const text = `Attached: ${args.fileName}
Unconfirmed:
${args.unconfirmed.length ? args.unconfirmed.map((u) => `- ${u}`).join("\n") : "- None"}

Reply APPROVE, REVISE, or FINALIZE.`;
  const html = wrapHtml(
    subject,
    `<p>Attached: <strong>${escapeHtml(args.fileName)}</strong></p>${
      args.downloadUrl ? downloadButton(args.downloadUrl, "Download .pptx") : ""
    }<p>Unconfirmed:</p><ul>${(args.unconfirmed.length ? args.unconfirmed : ["None"]).map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul><p><strong>Reply APPROVE, REVISE, or FINALIZE.</strong></p>`,
  );
  return { subject, text, html };
}

export function finalDeckReady(args: { fileName: string; downloadUrl?: string }): EmailContent {
  const subject = `Final deck attached: ${args.fileName}`;
  const text = `Final deck attached: ${args.fileName}
Post-QBR reminders scheduled:
- Client survey 24 hours after meeting
- Internal sentiment survey 24 hours after meeting
- Follow-up commitment capture after meeting`;
  const html = wrapHtml(
    subject,
    `<p>Final deck attached: <strong>${escapeHtml(args.fileName)}</strong></p>${
      args.downloadUrl ? downloadButton(args.downloadUrl, "Download .pptx") : ""
    }<p>Post-QBR reminders scheduled:</p><ul><li>Client survey 24 hours after meeting</li><li>Internal sentiment survey 24 hours after meeting</li><li>Follow-up commitment capture after meeting</li></ul>`,
  );
  return { subject, text, html };
}

export function clientSurvey(args: { clientName: string; questions: string[] }): EmailContent {
  const subject = `We'd love your feedback - ${args.clientName} QBR`;
  const text = `Please rate your experience:\n${args.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
  const html = wrapHtml(subject, `<p>Please rate your experience:</p>${list(args.questions)}`);
  return { subject, text, html };
}

export function internalSurvey(args: { clientName: string; questions: string[] }): EmailContent {
  const subject = `Internal sentiment check - ${args.clientName} QBR`;
  const text = `Quick internal pulse:\n${args.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
  const html = wrapHtml(subject, `<p>Quick internal pulse:</p>${list(args.questions)}`);
  return { subject, text, html };
}

export function statusSummary(args: {
  clientName: string;
  quarter: string;
  year: number;
  status: string;
  counts: { followUps: number; priorities: number; metrics: number; upcoming: number };
  needed: string[];
  unconfirmed: string[];
  hasDraft: boolean;
  vpApproved: boolean;
}): EmailContent {
  const subject = `Status: ${args.clientName} ${args.quarter} ${args.year} QBR`;
  const nextSteps: string[] = [];
  if (args.needed.length) nextSteps.push('Reply with the items under "Still needed" (just type what you know — "unknown" is fine).');
  if (!args.hasDraft) nextSteps.push('Reply "generate draft" to build the deck.');
  if (args.hasDraft && !args.vpApproved) nextSteps.push('Reply "approve" once the VP has signed off.');
  if (args.hasDraft && args.vpApproved) nextSteps.push('Reply "finalize" to produce the final deck.');

  const lines = [
    `Here's where ${args.clientName} ${args.quarter} ${args.year} stands:`,
    "",
    `Status: ${args.status.replace(/_/g, " ")}`,
    `Captured so far — follow-ups: ${args.counts.followUps}, priority items: ${args.counts.priorities}, metrics: ${args.counts.metrics}, what's-next: ${args.counts.upcoming}`,
    "",
    "Still needed:",
    ...(args.needed.length ? args.needed.map((n) => `- ${n}`) : ["- Nothing — you're all set."]),
    "",
    "Unconfirmed values:",
    ...(args.unconfirmed.length ? args.unconfirmed.map((u) => `- ${u}`) : ["- None"]),
    "",
    "Next steps:",
    ...nextSteps.map((s) => `- ${s}`),
  ];
  const text = lines.join("\n");
  const html = wrapHtml(
    subject,
    `<p>Here's where <strong>${escapeHtml(args.clientName)} ${args.quarter} ${args.year}</strong> stands:</p>
     <p>Status: <strong>${escapeHtml(args.status.replace(/_/g, " "))}</strong><br/>
     Captured — follow-ups: ${args.counts.followUps}, priorities: ${args.counts.priorities}, metrics: ${args.counts.metrics}, what's-next: ${args.counts.upcoming}</p>
     <p><strong>Still needed:</strong></p><ul>${(args.needed.length ? args.needed : ["Nothing — you're all set."]).map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
     <p><strong>Unconfirmed values:</strong></p><ul>${(args.unconfirmed.length ? args.unconfirmed : ["None"]).map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul>
     <p><strong>Next steps:</strong></p><ul>${nextSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`,
  );
  return { subject, text, html };
}

export function genericReply(args: { title: string; body: string }): EmailContent {
  return {
    subject: args.title,
    text: args.body,
    html: wrapHtml(args.title, `<p>${escapeHtml(args.body).replace(/\n/g, "<br/>")}</p>`),
  };
}
