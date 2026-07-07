import { promises as fs } from "fs";
import path from "path";
import PptxGenJS from "pptxgenjs";
import { SlideContent } from "../ai/schemas";
import { TO_CONFIRM } from "../constants";
import { DECK_THEME } from "./deckTheme";
import { localizedTheme } from "./localizedTheme";
import { normalizeSlideContent } from "./textNormalize";
import { readFile as readStorageFile } from "../storage";
import type { LocalizedTheme } from "./localizedTheme";

/**
 * Deterministic renderer for the client-facing QBR deck, styled to match the
 * approved house template (templates/qbr_brand_template.pptx).
 *
 * The 7 CORE client-facing sections always appear, in this order. No internal
 * enablement slides, no divider slides. Given the same SlideContent it always
 * produces the same deck.
 *
 *   1. Title
 *   2. Agenda
 *   3. Open Follow-Ups & Progress  (+ optional continuation slides)
 *   4. Priority Items
 *   5. Dashboard                   (+ optional continuation slides)
 *   6. What's Next
 *   7. Questions & Discussion
 *
 * When a table section (follow-ups / dashboard) has more rows than fit on one
 * slide, deterministic continuation slides are appended in place so nothing is
 * dropped. The total slide count is therefore VARIABLE (>= 7); the 7 core
 * sections are always present and in order.
 *
 * ALL formatting (geometry, fonts, sizes, colors) is read from DECK_THEME — see
 * deckTheme.ts. This module is a thin renderer with no inline style literals.
 */

const T = DECK_THEME;
const C = T.colors;
const F = T.font;

/** Active render theme (geometry + localized strings). Set per generateQbrDeck call. */
let R: LocalizedTheme = localizedTheme("fr");
let CONFIRM = TO_CONFIRM;

function setRenderLocale(locale?: string | null) {
  R = localizedTheme(locale);
  CONFIRM = R.toConfirm;
}

/** Number of CORE client-facing sections. Continuation slides may add more. */
export const QBR_SLIDE_COUNT = 7;

/**
 * Presentation-level options the live editor can toggle without changing slide
 * content. Stored as JSON on the QbrCycle so new toggles never need a migration.
 * Unknown keys are preserved in storage and ignored by the renderer.
 */
export interface DeckOptions {
  /** Show a page number on every slide. */
  pageNumbers?: boolean;
  /** Where page numbers appear. */
  pageNumberPosition?: "bottom-right" | "bottom-left" | "bottom-both";
  /** Footer text shown on every content slide. */
  footerText?: string | null;
  /** A short tag/badge (e.g. "67") shown in the corner of every slide. */
  titleTag?: string | null;
  /** Editor / site UI language (independent of deck render language). */
  uiLocale?: "fr" | "en";
  /**
   * Client/account logo shown in the top-right co-branding lockup (to the left
   * of the GDI logo). Accepts an /api/files storage URL, an external http(s)
   * URL, or a data URI. Optional — when absent only the GDI logo is shown.
   */
  clientLogoUrl?: string | null;
}

/** An image source pptxgenjs can consume: inline base64 data or a path/URL. */
type ImageSource = { data: string } | { path: string } | null;

/** Bundled GDI brand assets used on every deck (read from public/brand). */
interface BrandAssets {
  gdiLogo: ImageSource;
  employee: ImageSource;
  swoosh: ImageSource;
  clientLogo: ImageSource;
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** Read a bundled brand asset from public/brand as an inline data URI. */
async function loadBrandAsset(file: string): Promise<ImageSource> {
  try {
    const abs = path.join(process.cwd(), "public", "brand", file);
    const buf = await fs.readFile(abs);
    const ext = path.extname(file).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "image/png";
    return { data: `data:${mime};base64,${buf.toString("base64")}` };
  } catch {
    return null;
  }
}

/**
 * Resolve a client logo URL into something pptxgenjs can render. Local storage
 * URLs (/api/files/…) and data URIs are inlined as base64; external http(s)
 * URLs are passed through as a path for pptxgenjs to fetch.
 */
async function loadClientLogo(logoUrl?: string | null): Promise<ImageSource> {
  const url = logoUrl?.trim();
  if (!url) return null;
  if (url.startsWith("data:")) return { data: url };
  if (url.startsWith("/api/files/")) {
    try {
      const rel = url.replace(/^\/api\/files\//, "").split("/").join(path.sep);
      const buf = await readStorageFile(rel);
      const ext = path.extname(url).toLowerCase();
      const mime = MIME_BY_EXT[ext] ?? "image/png";
      return { data: `data:${mime};base64,${buf.toString("base64")}` };
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//i.test(url)) return { path: url };
  return null;
}

export async function generateQbrDeck(
  rawContent: SlideContent,
  options: DeckOptions = {},
  locale?: string | null,
): Promise<Buffer> {
  setRenderLocale(locale);
  // Enforce grammar/casing/whitespace normalization before any text is drawn,
  // so the rendered deck is consistent regardless of how content was produced.
  // Idempotent: safe even when the caller already normalized (buildSlideContent).
  const content = normalizeSlideContent(rawContent);

  // Load GDI brand assets + the (optional) client logo once per deck.
  const [gdiLogo, employee, swoosh, clientLogo] = await Promise.all([
    loadBrandAsset("gdi-logo-slide.png"),
    loadBrandAsset("gdi-employee.png"),
    loadBrandAsset("gdi-swoosh.png"),
    loadClientLogo(options.clientLogoUrl),
  ]);
  const brand: BrandAssets = { gdiLogo, employee, swoosh, clientLogo };

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: T.layout.name, width: T.layout.width, height: T.layout.height });
  pptx.layout = T.layout.name;
  pptx.author = T.layout.author;
  pptx.company = T.layout.company;
  pptx.theme = { headFontFace: F.heading, bodyFontFace: F.body };

  const titleSlide = slideTitle(pptx, content, options);
  const contentSlides: PptxGenJS.Slide[] = [
    ...slideAgenda(pptx, content),
    ...slideFollowUps(pptx, content),
    ...slidePriorities(pptx, content),
    ...slideDashboard(pptx, content),
    ...slideWhatsNext(pptx, content),
  ];
  const questionsSlide = slideQuestions(pptx, brand);

  // Co-branding lockup (client logo | GDI logo) on the title + content slides.
  // The questions slide is the dedicated closing visual and is left uncluttered.
  for (const slide of [titleSlide, ...contentSlides]) {
    addBrandLockup(slide, brand);
  }

  const slides: PptxGenJS.Slide[] = [titleSlide, ...contentSlides, questionsSlide];

  // Apply deck-wide overlays (page numbers / footer / tag) to every slide.
  applyDeckOverlays(slides, options);

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return out;
}

/** Pass an ImageSource straight into pptxgenjs addImage's path/data fields. */
function imgProps(src: NonNullable<ImageSource>): { path: string } | { data: string } {
  return "data" in src ? { data: src.data } : { path: src.path };
}

/**
 * Draw the top-right co-branding lockup: [client logo] │ [GDI logo], sitting
 * directly on the white slide (no plate). The GDI logo is always shown; the
 * client logo + divider only when a client logo exists.
 */
function addBrandLockup(slide: PptxGenJS.Slide, brand: BrandAssets) {
  if (!brand.gdiLogo) return;
  const b = T.brand;
  const W = T.layout.width;

  const gdiW = b.gdi.h * b.gdi.aspect;
  const hasClient = !!brand.clientLogo;
  const clientW = hasClient ? b.client.boxW : 0;
  const dividerBlock = hasClient ? b.divider.gap + b.divider.w + b.divider.gap : 0;

  const lockupW = clientW + dividerBlock + gdiW;
  const lockupX = W - b.rightMargin - lockupW;
  const midY = b.top + Math.max(b.gdi.h, b.client.boxH, b.divider.h) / 2;

  let x = lockupX;
  if (hasClient && brand.clientLogo) {
    slide.addImage({
      ...imgProps(brand.clientLogo),
      x,
      y: midY - b.client.boxH / 2,
      w: b.client.boxW,
      h: b.client.boxH,
      sizing: { type: "contain", w: b.client.boxW, h: b.client.boxH },
    });
    x += clientW + b.divider.gap;
    slide.addShape("rect", {
      x,
      y: midY - b.divider.h / 2,
      w: b.divider.w,
      h: b.divider.h,
      fill: { color: b.divider.color },
      line: { color: b.divider.color, width: 0 },
    });
    x += b.divider.w + b.divider.gap;
  }
  slide.addImage({
    ...imgProps(brand.gdiLogo),
    x,
    y: midY - b.gdi.h / 2,
    w: gdiW,
    h: b.gdi.h,
  });
}

/** Add page numbers, footer text, and a corner tag to all slides, post-build. */
function applyDeckOverlays(slides: PptxGenJS.Slide[], options: DeckOptions) {
  const o = T.overlays;
  const W = T.layout.width;
  const H = T.layout.height;
  const tag = options.titleTag?.toString().trim();
  const footer = options.footerText?.toString().trim();
  const showNumbers = !!options.pageNumbers;
  const pos = options.pageNumberPosition ?? T.defaults.pageNumberPosition;
  if (!tag && !footer && !showNumbers) return;

  // The anchoring hairline rule belongs to the footer band, so it appears only
  // when a footer or page numbers are shown (a corner tag alone does not draw
  // it). Keeps the renderer in lock-step with the live preview.
  const showRule = !!footer || showNumbers;
  slides.forEach((slide, idx) => {
    const num = idx + 1;
    if (showRule) {
      slide.addShape("rect", {
        x: o.rule.x,
        y: H - o.rule.yFromBottom,
        w: o.rule.w,
        h: o.rule.h,
        fill: { color: C.tableGrid },
        line: { color: C.tableGrid, width: 0 },
      });
    }
    if (footer) {
      slide.addText(footer, {
        x: o.footer.x,
        y: H - o.footer.yFromBottom,
        w: o.footer.w,
        h: o.footer.h,
        fontSize: o.footer.fontSize,
        color: C.greyText,
        fontFace: F.body,
        align: "center",
      });
    }
    if (showNumbers) {
      const positions =
        pos === "bottom-both" ? ["bottom-left", "bottom-right"] : [pos];
      for (const p of positions) {
        slide.addText(String(num), {
          x: p === "bottom-left" ? o.pageNumber.leftX : W - o.pageNumber.rightXFromRight,
          y: H - o.pageNumber.yFromBottom,
          w: o.pageNumber.w,
          h: o.pageNumber.h,
          fontSize: o.pageNumber.fontSize,
          color: C.greyText,
          fontFace: F.body,
          align: p === "bottom-left" ? "left" : "right",
        });
      }
    }
    if (tag) {
      slide.addText(tag, {
        x: W - o.tag.xFromRight,
        y: o.tag.y,
        w: o.tag.w,
        h: o.tag.h,
        fontSize: o.tag.fontSize,
        bold: true,
        color: C.accentYellow,
        fontFace: F.heading,
        align: "right",
      });
    }
  });
}

/**
 * Shared section header on the white content slide: a large blue title at the
 * top-left with a thin hairline rule beneath it, plus the bottom brand band.
 */
function sectionHeader(slide: PptxGenJS.Slide, title: string) {
  const h = T.sectionHeader;
  slide.background = { color: C.white };
  slide.addText(title, {
    x: h.title.x,
    y: h.title.y,
    w: h.title.w,
    h: h.title.h,
    fontSize: h.title.fontSize,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
    align: "left",
    valign: "middle",
  });
  slide.addShape("rect", {
    x: h.rule.x,
    y: h.rule.y,
    w: h.rule.w,
    h: h.rule.h,
    fill: { color: C.tableGrid },
    line: { color: C.tableGrid, width: 0 },
  });
  addBottomBand(slide);
}

/** Thin blue band (with a lighter accent line above it) anchoring the bottom. */
function addBottomBand(slide: PptxGenJS.Slide) {
  const b = T.contentBand;
  const W = T.layout.width;
  const H = T.layout.height;
  slide.addShape("rect", {
    x: 0,
    y: H - b.h - b.accentH,
    w: W,
    h: b.accentH,
    fill: { color: C.secondary },
    line: { color: C.secondary, width: 0 },
  });
  slide.addShape("rect", {
    x: 0,
    y: H - b.h,
    w: W,
    h: b.h,
    fill: { color: C.primary },
    line: { color: C.primary, width: 0 },
  });
}

function slideTitle(pptx: PptxGenJS, c: SlideContent, _options: DeckOptions = {}): PptxGenJS.Slide {
  const t = R.title;
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  slide.addText(c.title.clientName, {
    x: t.clientName.x,
    y: t.clientName.y,
    w: t.clientName.w,
    h: t.clientName.h,
    fontSize: t.clientName.fontSize,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  // Thin yellow accent rule under the client name.
  slide.addShape("rect", { x: t.accentBand.x, y: t.accentBand.y, w: t.accentBand.w, h: t.accentBand.h, fill: { color: C.accentYellow }, line: { color: C.accentYellow, width: 0 } });
  slide.addText(c.title.quarterYear, {
    x: t.quarterYear.x,
    y: t.quarterYear.y,
    w: t.quarterYear.w,
    h: t.quarterYear.h,
    fontSize: t.quarterYear.fontSize,
    color: C.secondary,
    bold: true,
    fontFace: F.body,
  });
  slide.addText(t.heading.text, {
    x: t.heading.x,
    y: t.heading.y,
    w: t.heading.w,
    h: t.heading.h,
    fontSize: t.heading.fontSize,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  slide.addText(c.title.meetingMonthYear, {
    x: t.meetingMonthYear.x,
    y: t.meetingMonthYear.y,
    w: t.meetingMonthYear.w,
    h: t.meetingMonthYear.h,
    fontSize: t.meetingMonthYear.fontSize,
    color: C.greyText,
    fontFace: F.body,
  });
  addBottomBand(slide);
  return slide;
}

function slideAgenda(pptx: PptxGenJS, c: SlideContent): PptxGenJS.Slide[] {
  const a = R.agenda;
  const source = c.agenda.length > 0 ? c.agenda : [...a.fallbackItems];
  // Numbered to mirror the template agenda (item -> slide order); numbers run
  // continuously across continuation slides.
  const items = source.map((label, i) => ({ number: i + a.startNumber, label }));
  const pages = chunkRows(items, agendaCapacity(a));
  return pages.map((pageItems, page) => {
    const slide = pptx.addSlide();
    sectionHeader(slide, page === 0 ? a.heading : a.headingCont);
    let y = a.yStart;
    for (const { number, label } of pageItems) {
      slide.addText(String(number), {
        x: a.number.x,
        y,
        w: a.number.w,
        h: a.number.h,
        fontSize: a.number.fontSize,
        bold: true,
        color: C.secondary,
        fontFace: F.heading,
        align: "center",
      });
      slide.addText(label, {
        x: a.label.x,
        y,
        w: a.label.w,
        h: a.label.h,
        fontSize: a.label.fontSize,
        bold: true,
        color: C.primary,
        fontFace: F.heading,
        valign: "middle",
      });
      y += a.step;
    }
    return slide;
  });
}

function slideFollowUps(pptx: PptxGenJS, c: SlideContent): PptxGenJS.Slide[] {
  const ft = R.followUpsTable;
  const dataRows: string[][] =
    c.followUps.length === 0
      ? [[...ft.emptyRow, CONFIRM, CONFIRM, CONFIRM]]
      : c.followUps.map((f) => [String(f.number), f.action, f.status, f.owner, f.dueDate]);

  // Capacity: data rows that fit between the table top and the content bottom,
  // reserving one row for the repeated header.
  const available = T.safeArea.contentBottom - ft.y;
  const rowsPerSlide = Math.max(1, Math.floor(available / ft.rowH) - 1);
  const pages = chunkRows(dataRows, rowsPerSlide);

  return pages.map((pageRows, page) => {
    const slide = pptx.addSlide();
    sectionHeader(slide, page === 0 ? ft.heading : ft.headingCont);
    const rows: PptxGenJS.TableRow[] = [
      ft.headers.map((h, i) => ({
        text: h,
        options: {
          bold: true,
          color: C.tableHeaderText,
          fill: { color: C.primary },
          fontSize: ft.headerFontSize,
          fontFace: F.heading,
          // Header alignment matches the column body alignment so each column
          // reads as one aligned stack.
          align: ft.colAlign[i] as PptxGenJS.HAlign,
          valign: "middle",
          margin: ptMargin(ft.cellPad),
        },
      })),
      ...pageRows.map((vals, i) => tableCells(vals, i)),
    ];
    slide.addTable(rows, {
      x: ft.x,
      y: ft.y,
      w: ft.w,
      colW: [...ft.colW],
      border: { type: "solid", color: C.tableGrid, pt: T.table.borderPt },
      fontSize: ft.bodyFontSize,
      fontFace: F.body,
      valign: "middle",
      // Header gets a slightly taller row; data rows use the standard height.
      rowH: [ft.headerRowH, ...pageRows.map(() => ft.rowH)],
    });
    return slide;
  });
}

function slidePriorities(pptx: PptxGenJS, c: SlideContent): PptxGenJS.Slide[] {
  const p = R.priorities;
  if (c.priorityItems.length === 0) {
    const slide = pptx.addSlide();
    sectionHeader(slide, p.heading);
    slide.addText(p.emptyText, {
      x: p.empty.x,
      y: p.empty.y,
      w: p.empty.w,
      h: p.empty.h,
      fontSize: p.empty.fontSize,
      color: C.greyText,
      fontFace: F.body,
    });
    return [slide];
  }
  return renderProseList(pptx, c.priorityItems.map((item) => ({ number: item.number, title: item.title, body: item.explanation })), p);
}

function slideDashboard(pptx: PptxGenJS, c: SlideContent): PptxGenJS.Slide[] {
  const d = R.dashboard;
  const groups: { title: string; rows: { label: string; value: string }[] }[] = [
    { title: d.groupTitles.healthAndSafety, rows: c.dashboard.healthAndSafety },
    { title: d.groupTitles.operational, rows: c.dashboard.operational },
    { title: d.groupTitles.financial, rows: c.dashboard.financial },
    ...(c.dashboard.customGroups ?? []),
  ].map((g) => ({
    title: g.title,
    rows: g.rows.length ? g.rows : [{ label: d.emptyRow.label, value: CONFIRM }],
  }));

  const available = T.safeArea.contentBottom - d.tableY;
  const rowsPerSlide = Math.max(1, Math.floor(available / d.rowH));
  const groupPages = chunkRows(groups, 3);

  const out: PptxGenJS.Slide[] = [];
  groupPages.forEach((groupSet, groupPage) => {
    const maxRows = Math.max(...groupSet.map((g) => g.rows.length));
    const pageCount = Math.max(1, Math.ceil(maxRows / rowsPerSlide));
    for (let page = 0; page < pageCount; page++) {
      const slide = pptx.addSlide();
      const isContinuation = groupPage > 0 || page > 0;
      sectionHeader(slide, isContinuation ? d.headingCont : d.heading);
      groupSet.forEach((g, i) => {
      const x = d.firstX + i * (d.colW + d.colGap);
      slide.addText(g.title, {
        x,
        y: d.groupTitle.y,
        w: d.colW,
        h: d.groupTitle.h,
        fontSize: d.groupTitle.fontSize,
        bold: true,
        color: C.white,
        fill: { color: C.secondary },
        fontFace: F.heading,
        align: "center",
        valign: "middle",
      });
      const start = page * rowsPerSlide;
      const slice = g.rows.slice(start, start + rowsPerSlide);
      // Keep a single (blank) row so the column keeps its frame when this group
      // has fewer rows than another group on a continuation slide.
      const rowsForPage = slice.length ? slice : [{ label: "", value: "" }];
      const tableRows: PptxGenJS.TableRow[] = rowsForPage.map((r, idx) => {
        const fill = (start + idx) % 2 ? C.rowAltFill : C.white;
        const pad = ptMargin(T.followUpsTable.cellPad);
        return [
          { text: r.label, options: { fontSize: d.bodyFontSize, color: C.text, align: "left", valign: "middle", fontFace: F.body, fill: { color: fill }, margin: pad } },
          { text: r.value, options: { fontSize: d.bodyFontSize, bold: true, color: C.primary, align: "right", valign: "middle", fontFace: F.body, fill: { color: fill }, margin: pad } },
        ];
      });
      slide.addTable(tableRows, {
        x,
        y: d.tableY,
        w: d.colW,
        colW: [d.colW * d.labelColRatio, d.colW * d.valueColRatio],
        border: { type: "solid", color: C.tableGrid, pt: T.table.borderPt },
        rowH: d.rowH,
        valign: "middle",
      });
      });
      out.push(slide);
    }
  });
  return out;
}

function slideWhatsNext(pptx: PptxGenJS, c: SlideContent): PptxGenJS.Slide[] {
  const w = R.whatsNext;
  if (c.whatsNext.length === 0) {
    const slide = pptx.addSlide();
    sectionHeader(slide, w.heading);
    slide.addText(w.emptyText, {
      x: w.empty.x,
      y: w.empty.y,
      w: w.empty.w,
      h: w.empty.h,
      fontSize: w.empty.fontSize,
      color: C.greyText,
      fontFace: F.body,
    });
    return [slide];
  }
  return renderProseList(pptx, c.whatsNext.map((item) => ({ number: item.number, title: item.title, body: item.detail })), w);
}

/**
 * Shared prose-list renderer for Priority Items / What's Next. Items are
 * paginated onto "(cont.)" slides past the per-slide capacity so a long list
 * never overflows the safe content area; each page's type is fit-scaled to its
 * own item count.
 */
function renderProseList(
  pptx: PptxGenJS,
  items: { number: number; title: string; body: string }[],
  cfg: {
    heading: string;
    headingCont: string;
    yStart: number;
    defaultStep: number;
    titleOffset: number;
    bottomGap: number;
    minBodyH: number;
    title: { x: number; w: number; h: number; fontSize: number; fontSizeMin: number };
    body: { x: number; w: number; fontSize: number; fontSizeMin: number };
  },
): PptxGenJS.Slide[] {
  const pages = chunkRows(items, proseCapacity(cfg));
  return pages.map((pageItems, page) => {
    const slide = pptx.addSlide();
    sectionHeader(slide, page === 0 ? cfg.heading : cfg.headingCont);
    const fit = fitProseList(pageItems.length, cfg);
    let y = cfg.yStart;
    for (const item of pageItems) {
      slide.addText(
        [
          { text: `${item.number}.  `, options: { bold: true, color: C.secondary } },
          { text: item.title, options: { bold: true, color: C.primary } },
        ],
        { x: cfg.title.x, y, w: cfg.title.w, h: cfg.title.h, fontSize: fit.titleFont, fontFace: F.heading },
      );
      slide.addText(item.body, {
        x: cfg.body.x,
        y: y + cfg.titleOffset,
        w: cfg.body.w,
        h: fit.bodyH,
        fontSize: fit.bodyFont,
        color: C.text,
        fontFace: F.body,
        valign: "top",
      });
      y += fit.step;
    }
    return slide;
  });
}

function slideQuestions(pptx: PptxGenJS, brand: BrandAssets): PptxGenJS.Slide {
  const q = R.questions;
  const qt = DECK_THEME.questions;
  const W = T.layout.width;
  const H = T.layout.height;
  const slide = pptx.addSlide();
  slide.background = { color: C.white };

  // 1) Light-blue brand swoosh, anchored bottom-right (drawn first, sits behind).
  if (brand.swoosh) {
    const sw = qt.swoosh.w;
    const sh = sw / qt.swoosh.aspect;
    slide.addImage({
      ...imgProps(brand.swoosh),
      x: W - qt.swoosh.wFromRight - sw,
      y: H - qt.swoosh.bottomGap - sh,
      w: sw,
      h: sh,
    });
  }

  // 2) GDI employee photo, in front of the swoosh, anchored to the bottom edge.
  if (brand.employee) {
    const ew = qt.employee.w;
    const eh = ew / qt.employee.aspect;
    slide.addImage({
      ...imgProps(brand.employee),
      x: W - qt.employee.wFromRight - ew,
      y: H - qt.employee.bottomGap - eh,
      w: ew,
      h: eh,
    });
  }

  // 3) "Thank you!" lead-in (grey) + large blue "QUESTIONS?" headline, top-left.
  slide.addText(q.thanksText, {
    x: qt.thanks.x,
    y: qt.thanks.y,
    w: qt.thanks.w,
    h: qt.thanks.h,
    fontSize: qt.thanks.fontSize,
    color: C.greyText,
    fontFace: F.body,
    align: "left",
  });
  slide.addText(q.headingText, {
    x: qt.heading.x,
    y: qt.heading.y,
    w: qt.heading.w,
    h: qt.heading.h,
    fontSize: qt.heading.fontSize,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
    align: "left",
  });

  // 4) Blue band anchoring the bottom edge (lighter accent line above it).
  slide.addShape("rect", {
    x: 0,
    y: H - qt.bottomBand.h - qt.bottomBandAccent.h,
    w: W,
    h: qt.bottomBandAccent.h,
    fill: { color: C.secondary },
    line: { color: C.secondary, width: 0 },
  });
  slide.addShape("rect", {
    x: 0,
    y: H - qt.bottomBand.h,
    w: W,
    h: qt.bottomBand.h,
    fill: { color: C.primary },
    line: { color: C.primary, width: 0 },
  });
  return slide;
}

/**
 * Fit-to-slide layout for a prose list section (Priority Items / What's Next).
 * Returns a per-item vertical step plus font sizes / body height scaled so that
 * `count` items always fit within the slide content area. At low counts the
 * result equals the section defaults exactly (no scaling); larger counts scale
 * type down within the section's min/max bounds.
 */
function fitProseList(
  count: number,
  cfg: { yStart: number; defaultStep: number; titleOffset: number; bottomGap: number; minBodyH: number; title: { fontSize: number; fontSizeMin: number }; body: { fontSize: number; fontSizeMin: number } },
): { step: number; titleFont: number; bodyFont: number; bodyH: number } {
  const available = T.safeArea.contentBottom - cfg.yStart;
  const step = Math.min(cfg.defaultStep, available / count);
  const scale = step / cfg.defaultStep; // <= 1
  const titleFont = clamp(Math.round(cfg.title.fontSize * scale), cfg.title.fontSizeMin, cfg.title.fontSize);
  const bodyFont = clamp(Math.round(cfg.body.fontSize * scale), cfg.body.fontSizeMin, cfg.body.fontSize);
  const bodyH = Math.max(step - cfg.titleOffset - cfg.bottomGap, cfg.minBodyH);
  return { step, titleFont, bodyFont, bodyH };
}

/**
 * Maximum prose items per slide: each item needs at least a title line plus a
 * minimum body height. Beyond this the section paginates onto continuation
 * slides so content never overflows the safe area. Mirrored in slideManifest.ts.
 */
function proseCapacity(cfg: { yStart: number; titleOffset: number; minBodyH: number }): number {
  const available = T.safeArea.contentBottom - cfg.yStart;
  const minStep = cfg.titleOffset + cfg.minBodyH;
  return Math.max(1, Math.floor(available / minStep));
}

/** Maximum agenda items that fit on one slide. Mirrored in slideManifest.ts. */
function agendaCapacity(cfg: { yStart: number; step: number }): number {
  const available = T.safeArea.contentBottom - cfg.yStart;
  return Math.max(1, Math.floor(available / cfg.step));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Split rows into deterministic chunks of at most `size`; always >= 1 chunk. */
function chunkRows<R>(rows: R[], size: number): R[][] {
  if (rows.length === 0) return [[]];
  const out: R[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Build a styled follow-ups table row with zebra striping. */
function tableCells(values: string[], rowIndex: number): PptxGenJS.TableRow {
  const ft = R.followUpsTable;
  const fill = rowIndex % 2 ? C.rowAltFill : C.white;
  return values.map((text, i) => ({
    text,
    options: {
      fontSize: ft.bodyFontSize,
      fontFace: F.body,
      color: i === 0 ? C.secondary : C.text,
      bold: i === 0,
      fill: { color: fill },
      align: ft.colAlign[i] as PptxGenJS.HAlign,
      valign: "middle",
      margin: ptMargin(ft.cellPad),
    },
  }));
}

/** Convert an inch cell-padding into the pt margins pptxgenjs expects. */
function ptMargin(inches: number): [number, number, number, number] {
  const pt = Math.round(inches * 72);
  return [pt, pt, pt, pt];
}
