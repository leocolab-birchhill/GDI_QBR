import type { CustomSlide, SlideContent } from "../ai/schemas";
import type { DeckOptions } from "./generateQbrDeck";
import { TO_CONFIRM } from "../constants";
import { DECK_THEME } from "./deckTheme";
import { localizedTheme } from "./localizedTheme";
import { normalizeSlideContent } from "./textNormalize";

/**
 * Builds a structural manifest of the deck — the same ordered set of slides the
 * deterministic renderer (generateQbrDeck.ts) produces, including continuation
 * slides for overflowing tables and the same fit-to-slide font scaling for prose
 * sections.
 *
 * This is the single source of truth for the in-browser live preview: it must
 * stay in lock-step with generateQbrDeck.ts so slide indices (used for
 * auto-scroll to the most recently edited slide) match what the user downloads.
 *
 * It is pure data (no pptxgenjs / Node deps) so it can run on the client.
 */

const T = DECK_THEME;

/** The 7 core client-facing sections, in order. */
export type SlideSection =
  | "title"
  | "agenda"
  | "followUps"
  | "priorities"
  | "dashboard"
  | "whatsNext"
  | "questions";

export interface SlideOverlays {
  pageNumber: number | null;
  pageNumberPosition: "bottom-right" | "bottom-left" | "bottom-both";
  footer: string | null;
  tag: string | null;
  /** Whether the top-right co-branding lockup (client logo │ GDI) is shown. */
  showLockup: boolean;
  /** Client logo URL for the lockup (null → only the GDI logo is shown). */
  clientLogoUrl: string | null;
}

interface BaseSlide {
  /** 1-based slide number, matching the rendered .pptx. */
  index: number;
  section: SlideSection;
  /** Set for user-created custom slides (the CustomSlide id). */
  customId?: string;
  /** True for "(cont.)" continuation slides. */
  continuation: boolean;
  overlays: SlideOverlays;
}

export type PreviewSlide =
  | (BaseSlide & {
      kind: "title";
      clientName: string;
      quarterYear: string;
      headingText: string;
      meetingMonthYear: string;
    })
  | (BaseSlide & { kind: "agenda"; heading: string; items: { number: number; label: string }[] })
  | (BaseSlide & {
      kind: "table";
      heading: string;
      headers: string[];
      rows: string[][];
      colPct: number[];
    })
  | (BaseSlide & {
      kind: "prose";
      heading: string;
      titleFontPt: number;
      bodyFontPt: number;
      items: { number: number; title: string; body: string }[];
    })
  | (BaseSlide & {
      kind: "dashboard";
      heading: string;
      columns: { title: string; rows: { label: string; value: string }[] }[];
    })
  | (BaseSlide & { kind: "questions"; headingText: string; thanksText: string });

/** Omit that distributes over a union so each member keeps its own keys. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type SlideBody = DistributiveOmit<PreviewSlide, "index" | "overlays">;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function chunkRows<R>(rows: R[], size: number): R[][] {
  if (rows.length === 0) return [[]];
  const out: R[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Mirror of generateQbrDeck.ts fitProseList(). */
function fitProseFonts(
  count: number,
  cfg: { yStart: number; defaultStep: number; title: { fontSize: number; fontSizeMin: number }; body: { fontSize: number; fontSizeMin: number } },
): { titleFontPt: number; bodyFontPt: number } {
  if (count <= 0) return { titleFontPt: cfg.title.fontSize, bodyFontPt: cfg.body.fontSize };
  const available = T.safeArea.contentBottom - cfg.yStart;
  const step = Math.min(cfg.defaultStep, available / count);
  const scale = step / cfg.defaultStep;
  return {
    titleFontPt: clamp(Math.round(cfg.title.fontSize * scale), cfg.title.fontSizeMin, cfg.title.fontSize),
    bodyFontPt: clamp(Math.round(cfg.body.fontSize * scale), cfg.body.fontSizeMin, cfg.body.fontSize),
  };
}

/**
 * Mirror of generateQbrDeck.ts proseCapacity(): the maximum number of prose
 * items that can share one slide while each still gets at least a title line
 * plus a minimum body height. Beyond this the section paginates onto "(cont.)"
 * slides so nothing ever overflows the safe content area.
 */
function proseCapacity(cfg: { yStart: number; titleOffset: number; minBodyH: number }): number {
  const available = T.safeArea.contentBottom - cfg.yStart;
  const minStep = cfg.titleOffset + cfg.minBodyH;
  return Math.max(1, Math.floor(available / minStep));
}

/** Mirror of generateQbrDeck.ts agendaCapacity(): items that fit on one agenda slide. */
function agendaCapacity(cfg: { yStart: number; step: number }): number {
  const available = T.safeArea.contentBottom - cfg.yStart;
  return Math.max(1, Math.floor(available / cfg.step));
}

/** Default order of the movable middle sections. */
const DEFAULT_MIDDLE_ORDER: SlideSection[] = [
  "agenda",
  "followUps",
  "priorities",
  "dashboard",
  "whatsNext",
];

/** One entry of the deck's slide sequence: a built-in section or a custom slide. */
export type DeckEntry =
  | { type: "section"; section: SlideSection }
  | { type: "custom"; slide: CustomSlide; anchorSection: SlideSection };

/**
 * Resolve the deck's slide sequence from the content's layout fields: apply the
 * custom section order, drop hidden sections, and interleave custom slides
 * after their anchor sections. Shared by the live preview manifest AND the
 * .pptx renderer so both always agree on slide order.
 */
export function resolveDeckSequence(content: SlideContent): DeckEntry[] {
  const hidden = new Set((content.hiddenSections ?? []).filter((s) => s !== "title"));
  const stored = (content.sectionOrder ?? []).filter((s) =>
    DEFAULT_MIDDLE_ORDER.includes(s as SlideSection),
  ) as SlideSection[];
  const middle = [...stored, ...DEFAULT_MIDDLE_ORDER.filter((s) => !stored.includes(s))];
  const sections = (["title", ...middle, "questions"] as SlideSection[]).filter(
    (s) => !hidden.has(s),
  );

  const customs = content.customSlides ?? [];
  const used = new Set<string>();
  const entries: DeckEntry[] = [];
  for (const section of sections) {
    entries.push({ type: "section", section });
    for (const c of customs) {
      if (c.afterSection === section && !used.has(c.id)) {
        entries.push({ type: "custom", slide: c, anchorSection: section });
        used.add(c.id);
      }
    }
  }
  // Custom slides anchored to a hidden/unknown section still render, placed
  // just before the closing questions slide (or at the end when it is hidden).
  const leftovers = customs.filter((c) => !used.has(c.id));
  if (leftovers.length) {
    const qIdx = entries.findIndex((e) => e.type === "section" && e.section === "questions");
    const anchor: SlideSection =
      qIdx > 0 && entries[qIdx - 1].type === "section"
        ? (entries[qIdx - 1] as { section: SlideSection }).section
        : "whatsNext";
    const items: DeckEntry[] = leftovers.map((slide) => ({
      type: "custom",
      slide,
      anchorSection: anchor,
    }));
    if (qIdx >= 0) entries.splice(qIdx, 0, ...items);
    else entries.push(...items);
  }
  return entries;
}

/**
 * Parse a custom prose slide body: one item per line; "Title: detail" (or
 * "Title - detail") splits into a bold headline + body, a plain line becomes a
 * headline with no body.
 */
export function parseCustomProse(body: string): { number: number; title: string; body: string }[] {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line, i) => {
    const m = line.match(/^(.{1,80}?)\s*(?::|\s[—–-]\s)\s*(.+)$/);
    if (m) return { number: i + 1, title: m[1].trim(), body: m[2].trim() };
    return { number: i + 1, title: line, body: "" };
  });
}

/**
 * Parse a custom table slide body: one row per line, cells separated by "|".
 * The first line is the header row; rows are padded to the widest line.
 */
export function parseCustomTable(body: string): { headers: string[]; rows: string[][] } {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\|/, "").replace(/\|$/, ""))
    .map((l) => l.split("|").map((c) => c.trim()));
  if (lines.length === 0) return { headers: ["Item", "Detail"], rows: [] };
  const width = Math.max(...lines.map((r) => r.length));
  const padded = lines.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill("")]);
  return { headers: padded[0], rows: padded.slice(1) };
}

/** Localized "(cont.)" heading for a custom slide's continuation pages. */
export function customContHeading(title: string, locale?: string | null): string {
  return locale === "en" ? `${title} (cont.)` : `${title} (suite)`;
}

export function buildDeckManifest(
  rawContent: SlideContent,
  options: DeckOptions = {},
  locale?: string | null,
): PreviewSlide[] {
  const R = localizedTheme(locale);
  const confirm = R.toConfirm;
  // Mirror the renderer's enforced normalization so the live preview matches the
  // downloaded deck exactly (idempotent if the caller already normalized).
  const content = normalizeSlideContent(rawContent);
  const slides: SlideBody[] = [];

  // Per-section builders — assembled below in the layout-resolved order.
  const build: Record<SlideSection, () => void> = {
    title: () => {
      slides.push({
        kind: "title",
        section: "title",
        continuation: false,
        clientName: content.title.clientName,
        quarterYear: content.title.quarterYear,
        headingText: R.title.heading.text,
        meetingMonthYear: content.title.meetingMonthYear,
      });
    },
    // Agenda (paginated — overflow items flow onto continuation slides)
    agenda: () => {
      const a = R.agenda;
      const agendaItems = (content.agenda.length > 0 ? content.agenda : [...a.fallbackItems]).map(
        (label, i) => ({ number: i + a.startNumber, label }),
      );
      const agendaPerSlide = agendaCapacity(a);
      chunkRows(agendaItems, agendaPerSlide).forEach((items, page) => {
        slides.push({
          kind: "agenda",
          section: "agenda",
          continuation: page > 0,
          heading: page === 0 ? a.heading : a.headingCont,
          items,
        });
      });
    },
    // Open Follow-Ups & Progress (paginated table)
    followUps: () => {
      const ft = R.followUpsTable;
      const followRows: string[][] =
        content.followUps.length === 0
          ? [[...ft.emptyRow, confirm, confirm, confirm]]
          : content.followUps.map((f) => [String(f.number), f.action, f.status, f.owner, f.dueDate]);
      const followAvail = T.safeArea.contentBottom - ft.y;
      const followPerSlide = Math.max(1, Math.floor(followAvail / ft.rowH) - 1);
      const colTotal = ft.colW.reduce((a, b) => a + b, 0);
      const followColPct = ft.colW.map((c) => (c / colTotal) * 100);
      chunkRows(followRows, followPerSlide).forEach((rows, page) => {
        slides.push({
          kind: "table",
          section: "followUps",
          continuation: page > 0,
          heading: page === 0 ? ft.heading : ft.headingCont,
          headers: [...ft.headers],
          rows,
          colPct: followColPct,
        });
      });
    },
    // Priority Items (fit-to-slide prose, paginated past the per-slide capacity)
    priorities: () => {
      const priorityItems = content.priorityItems.map((p) => ({ number: p.number, title: p.title, body: p.explanation }));
      chunkRows(priorityItems, proseCapacity(R.priorities)).forEach((items, page) => {
        const fonts = fitProseFonts(items.length, R.priorities);
        slides.push({
          kind: "prose",
          section: "priorities",
          continuation: page > 0,
          heading: page === 0 ? R.priorities.heading : R.priorities.headingCont,
          titleFontPt: fonts.titleFontPt,
          bodyFontPt: fonts.bodyFontPt,
          items,
        });
      });
    },
    // Dashboard (paginated 3-column tables; hidden groups are skipped)
    dashboard: () => {
      const d = R.dashboard;
      const hiddenGroups = new Set(
        (content.dashboard.hiddenGroups ?? []).map((g) => g.trim().toLowerCase()),
      );
      const isHidden = (...names: string[]) =>
        names.some((n) => hiddenGroups.has(n.trim().toLowerCase()));
      const groups = [
        {
          title: d.groupTitles.healthAndSafety,
          rows: content.dashboard.healthAndSafety,
          hidden: isHidden("Health & Safety", d.groupTitles.healthAndSafety),
        },
        {
          title: d.groupTitles.operational,
          rows: content.dashboard.operational,
          hidden: isHidden("Operational", d.groupTitles.operational),
        },
        {
          title: d.groupTitles.financial,
          rows: content.dashboard.financial,
          hidden: isHidden("Financial", d.groupTitles.financial),
        },
        ...(content.dashboard.customGroups ?? []).map((g) => ({
          title: g.title,
          rows: g.rows,
          hidden: isHidden(g.title),
        })),
      ]
        .filter((g) => !g.hidden)
        .map((g) => ({
          title: g.title,
          rows: g.rows.length ? g.rows : [{ label: d.emptyRow.label, value: confirm }],
        }));
      if (groups.length === 0) {
        groups.push({ title: d.groupTitles.operational, rows: [{ label: d.emptyRow.label, value: confirm }] });
      }
      const dashAvail = T.safeArea.contentBottom - d.tableY;
      const dashPerSlide = Math.max(1, Math.floor(dashAvail / d.rowH));
      chunkRows(groups, 3).forEach((groupSet, groupPage) => {
        const maxRows = Math.max(...groupSet.map((g) => g.rows.length));
        const dashPages = Math.max(1, Math.ceil(maxRows / dashPerSlide));
        for (let page = 0; page < dashPages; page++) {
          const start = page * dashPerSlide;
          const continuation = groupPage > 0 || page > 0;
          slides.push({
            kind: "dashboard",
            section: "dashboard",
            continuation,
            heading: continuation ? d.headingCont : d.heading,
            columns: groupSet.map((g) => ({ title: g.title, rows: g.rows.slice(start, start + dashPerSlide) })),
          });
        }
      });
    },
    // What's Next (fit-to-slide prose, paginated past the per-slide capacity)
    whatsNext: () => {
      const whatsNextItems = content.whatsNext.map((u) => ({ number: u.number, title: u.title, body: u.detail }));
      chunkRows(whatsNextItems, proseCapacity(R.whatsNext)).forEach((items, page) => {
        const fonts = fitProseFonts(items.length, R.whatsNext);
        slides.push({
          kind: "prose",
          section: "whatsNext",
          continuation: page > 0,
          heading: page === 0 ? R.whatsNext.heading : R.whatsNext.headingCont,
          titleFontPt: fonts.titleFontPt,
          bodyFontPt: fonts.bodyFontPt,
          items,
        });
      });
    },
    questions: () => {
      slides.push({
        kind: "questions",
        section: "questions",
        continuation: false,
        headingText: R.questions.headingText,
        thanksText: R.questions.thanksText,
      });
    },
  };

  /** Custom slide: prose (What's Next geometry) or generic table (follow-ups geometry). */
  const buildCustom = (custom: CustomSlide, anchorSection: SlideSection) => {
    if (custom.kind === "table") {
      const ft = R.followUpsTable;
      const { headers, rows } = parseCustomTable(custom.body);
      const avail = T.safeArea.contentBottom - ft.y;
      const perSlide = Math.max(1, Math.floor(avail / ft.rowH) - 1);
      const colPct = headers.map(() => 100 / headers.length);
      chunkRows(rows, perSlide).forEach((pageRows, page) => {
        slides.push({
          kind: "table",
          section: anchorSection,
          customId: custom.id,
          continuation: page > 0,
          heading: page === 0 ? custom.title : customContHeading(custom.title, locale),
          headers,
          rows: pageRows,
          colPct,
        });
      });
      return;
    }
    const items = parseCustomProse(custom.body);
    chunkRows(items, proseCapacity(R.whatsNext)).forEach((pageItems, page) => {
      const fonts = fitProseFonts(pageItems.length, R.whatsNext);
      slides.push({
        kind: "prose",
        section: anchorSection,
        customId: custom.id,
        continuation: page > 0,
        heading: page === 0 ? custom.title : customContHeading(custom.title, locale),
        titleFontPt: fonts.titleFontPt,
        bodyFontPt: fonts.bodyFontPt,
        items: pageItems,
      });
    });
  };

  for (const entry of resolveDeckSequence(content)) {
    if (entry.type === "section") build[entry.section]();
    else buildCustom(entry.slide, entry.anchorSection);
  }

  // Assign 1-based indices + per-slide overlays (mirrors applyDeckOverlays).
  const showNumbers = !!options.pageNumbers;
  const pos = options.pageNumberPosition ?? T.defaults.pageNumberPosition;
  const footer = options.footerText?.toString().trim() || null;
  const tag = options.titleTag?.toString().trim() || null;
  const clientLogoUrl = options.clientLogoUrl?.toString().trim() || null;

  return slides.map((s, i) => ({
    ...(s as PreviewSlide),
    index: i + 1,
    overlays: {
      pageNumber: showNumbers ? i + 1 : null,
      pageNumberPosition: pos,
      footer,
      tag,
      // The lockup appears on the title + content slides; the questions slide is
      // the dedicated closing visual (employee + swoosh) and is left uncluttered.
      showLockup: s.section !== "questions",
      clientLogoUrl,
    },
  }));
}

/** Map slide-edit operation types to the deck section(s) they affect. */
const OP_SECTION: Record<string, SlideSection> = {
  set_metric: "dashboard",
  remove_metric: "dashboard",
  add_priority: "priorities",
  reword_priority: "priorities",
  remove_priority: "priorities",
  add_upcoming: "whatsNext",
  remove_upcoming: "whatsNext",
  add_commitment: "followUps",
  set_commitment_status: "followUps",
  remove_commitment: "followUps",
  set_client_name: "title",
  set_agenda: "agenda",
  set_meeting_date: "title",
  set_next_meeting_date: "title",
  add_slide: "agenda",
  edit_slide: "agenda",
  remove_slide: "agenda",
  move_slide: "agenda",
  set_section_hidden: "agenda",
  add_dashboard_group: "dashboard",
  remove_dashboard_group: "dashboard",
};

/**
 * Given the edit operations applied this turn, return the sections that changed
 * (used to auto-scroll the preview to the most recently edited slide). Deck-wide
 * format ops (page numbers / footer / tag) affect every slide and intentionally
 * return no specific section so the preview stays where it is.
 */
export function changedSectionsForOps(opTypes: string[]): SlideSection[] {
  const out: SlideSection[] = [];
  for (const t of opTypes) {
    const section = OP_SECTION[t];
    if (section && !out.includes(section)) out.push(section);
  }
  return out;
}
