import path from "path";
import { promises as fs } from "fs";
import JSZip from "jszip";
import { env } from "../env";
import { QBR_TEMPLATE_REFERENCE } from "./templateReference";

/**
 * Reads the approved house QBR deck (a real .pptx) and turns it into a
 * slide-by-slide text transcript that is injected into the OpenAI deck-drafting
 * prompt as the EXACT format example.
 *
 * Why not send the .pptx bytes straight to OpenAI? The chat/responses models do
 * not natively parse .pptx files (only PDFs/images are read directly), so the
 * reliable approach is to extract the deck's real structure and content here and
 * feed that text to the model. The result is that generated decks mirror the
 * actual approved template's slide order, section names, table columns, and
 * brevity — using the real file as the source of truth instead of a hand-written
 * summary.
 *
 * The extracted reference is cached for the life of the process. If the file is
 * missing or unreadable we fall back to the curated static reference so the app
 * keeps working.
 */

const MAX_REFERENCE_CHARS = 9000;

let cached: { key: string; reference: string } | null = null;

/** Absolute path to the configured template deck. */
export function templatePath(): string {
  return path.resolve(process.cwd(), env.QBR_TEMPLATE_PATH);
}

/**
 * Returns the format reference for the AI drafter. Prefers a live extraction of
 * the real template deck; falls back to the curated static reference.
 */
export async function getTemplateReference(): Promise<string> {
  const abs = templatePath();
  if (cached && cached.key === abs) return cached.reference;

  try {
    const buf = await fs.readFile(abs);
    const reference = await extractDeckReference(buf, path.basename(abs));
    cached = { key: abs, reference };
    return reference;
  } catch (err) {
    console.warn(
      "[ppt] could not read template at %s (%s) — using static reference.",
      abs,
      (err as Error).message,
    );
    cached = { key: abs, reference: QBR_TEMPLATE_REFERENCE };
    return QBR_TEMPLATE_REFERENCE;
  }
}

/** Parse a .pptx buffer into a structured, model-friendly text reference. */
export async function extractDeckReference(buf: Buffer, fileName: string): Promise<string> {
  const zip = await JSZip.loadAsync(buf);

  // Slide XML parts are ppt/slides/slideN.xml — order them numerically.
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slides: string[] = [];
  for (const p of slidePaths) {
    const xml = await zip.files[p].async("string");
    const lines = slideLines(xml);
    if (lines.length === 0) continue;
    slides.push(`--- Slide ${slides.length + 1} ---\n${lines.join("\n")}`);
  }

  if (slides.length === 0) return QBR_TEMPLATE_REFERENCE;

  const header = `ACTUAL APPROVED QBR TEMPLATE — extracted from "${fileName}" (${slides.length} slides).
Emulate this EXACT structure: same slide order, the same section/slide names, the
same table columns, the same number of bullet/priority items, and the same level
of brevity. Do NOT copy its specific facts, numbers, names, dates, or wording —
those come only from the provided QBR data. Write output in the same language as
the provided QBR data; mark unknown values as "To confirm".

TEMPLATE CONTENT (verbatim transcript, structure reference only):
`;

  let body = slides.join("\n\n");
  if (body.length > MAX_REFERENCE_CHARS) {
    body = body.slice(0, MAX_REFERENCE_CHARS) + "\n…(truncated)";
  }
  return `${header}\n${body}`.trim();
}

function slideNumber(p: string): number {
  const m = p.match(/slide(\d+)\.xml$/);
  return m ? Number(m[1]) : 0;
}

/**
 * Turn a slide's raw DrawingML XML into readable lines. Each paragraph (<a:p>)
 * becomes one line; text runs (<a:t>) within it are concatenated. Table rows are
 * rendered with " | " separators so the column structure survives.
 */
function slideLines(xml: string): string[] {
  // Normalize line breaks and row boundaries before stripping tags.
  const normalized = xml
    .replace(/<a:br\s*\/>/g, " ")
    .replace(/<\/a:p>/g, "\u0001") // paragraph boundary
    .replace(/<\/a:tc>/g, "\u0002") // table cell boundary
    .replace(/<\/a:tr>/g, "\u0003"); // table row boundary

  // Collect text per paragraph in document order.
  const paragraphs: string[] = [];
  // Split on the table-row marker first so rows render with cell separators.
  for (const segment of normalized.split("\u0003")) {
    const isRow = segment.includes("\u0002");
    if (isRow) {
      const cells = segment
        .split("\u0002")
        .map((c) => decode(stripTags(textRuns(c))))
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length) paragraphs.push(cells.join(" | "));
      continue;
    }
    for (const para of segment.split("\u0001")) {
      const text = decode(stripTags(textRuns(para))).replace(/\s+/g, " ").trim();
      if (text) paragraphs.push(text);
    }
  }

  // De-duplicate consecutive identical lines (common with placeholders).
  const out: string[] = [];
  for (const line of paragraphs) {
    if (out[out.length - 1] !== line) out.push(line);
  }
  return out;
}

/** Keep only <a:t> run contents, joined, dropping all other markup noise. */
function textRuns(xml: string): string {
  const matches = xml.match(/<a:t>[\s\S]*?<\/a:t>/g);
  if (!matches) return "";
  return matches.map((m) => m.replace(/<\/?a:t>/g, "")).join("");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
