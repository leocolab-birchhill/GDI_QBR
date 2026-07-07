/**
 * Strip quoted reply history from an inbound email body so downstream logic
 * (language detection, classification) sees only what the sender just wrote —
 * not the entire French/English thread history Outlook appends below a reply.
 *
 * Conservative: cuts at the FIRST recognized reply boundary. If none is found
 * the whole body is returned unchanged.
 */

const BOUNDARY_PATTERNS: RegExp[] = [
  // Outlook header block: "From: ... \n Sent: ... \n To: ..."
  /^\s*From:\s.+$/im,
  // Gmail / Apple: "On <date> ... wrote:"
  /^\s*On\b.+\bwrote:\s*$/im,
  // French equivalents.
  /^\s*De\s*:\s.+$/im,
  /^\s*Le\b.+\ba[\s\u00a0]*écrit\s*:\s*$/im,
  // Classic "-----Original Message-----" separators.
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^_{5,}\s*$/m,
  // Mobile signatures that precede quoted text.
  /^\s*Sent from my .+$/im,
  /^\s*Envoyé de mon .+$/im,
];

export function stripQuotedReply(body: string): string {
  if (!body) return "";
  let cutIndex = body.length;
  for (const re of BOUNDARY_PATTERNS) {
    const m = body.match(re);
    if (m && m.index !== undefined && m.index < cutIndex) {
      cutIndex = m.index;
    }
  }
  // Also cut at the first block of ">"-quoted lines.
  const quoteLine = body.match(/^\s*>.*$/m);
  if (quoteLine && quoteLine.index !== undefined && quoteLine.index < cutIndex) {
    cutIndex = quoteLine.index;
  }
  const head = body.slice(0, cutIndex).trim();
  // If stripping left almost nothing, fall back to the full body so we never
  // detect on an empty string.
  return head.length >= 2 ? head : body.trim();
}
