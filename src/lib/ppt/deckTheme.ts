/**
 * Single source of truth for ALL BR deck formatting.
 *
 * Every color, font, geometry value (x/y/w/h), font size, column width and row
 * height used by the deterministic renderer (generateQbrDeck.ts) lives here.
 * The renderer is a thin consumer: it reads from DECK_THEME and never inlines
 * its own literals. Edit a value here and it changes the deck everywhere that
 * value is used.
 *
 * Extracted from the approved house template
 * (templates/qbr_brand_template.pptx — "Galeries d'Anjou" deck).
 *
 * LAYOUT GRID
 * -----------
 * All content slides share ONE grid so headings, tables, list numbers, and body
 * text line up on the same vertical rules:
 *   - `MARGIN_X` is the master left/right margin. Every content element (section
 *     header title, tables, agenda numbers, prose titles, dashboard columns)
 *     starts at this margin, so their left edges form a single clean line.
 *   - `CONTENT_W` is the usable width between margins; full-width tables and
 *     prose blocks span exactly this.
 *   - `PROSE_INDENT` is the hanging indent so a numbered item's body text aligns
 *     under the title text (past the "1.  " marker), not under the number.
 *   - `FOOTER_BAND` reserves a fixed strip at the bottom for the footer / page
 *     numbers so body content and the footer never collide.
 */

/** Core palette (hex without '#'). */
export const BRAND = {
  primary: "00467F", // dark blue — titles, section header bars
  secondary: "156C9C", // medium blue — group headers, accents
  navy: "002060",
  accentYellow: "FFFC00",
  accentRed: "CE1141",
  // Neutrals.
  white: "FFFFFF",
  black: "000000",
  text: "1A1A1A",
  greyText: "646464",
  tableGrid: "DEE0E3",
  tableHeaderText: "FFFFFF",
  rowAltFill: "F2F4F6",
  subtitle: "646464",
  // Muted light-blue used for secondary text on the dark (primary) backgrounds.
  mutedOnPrimary: "D6E2EE",
} as const;

/**
 * Fonts. The template uses Arial / Arial Narrow / Myriad Pro. Arial is used as
 * the reliable cross-platform face; Arial Narrow is used for section subtitles
 * to echo the original look.
 */
export const FONT = {
  heading: "Arial",
  body: "Arial",
  subtitle: "Arial Narrow",
} as const;

/**
 * One-line section descriptors shown under each header, mirroring the template's
 * explanatory subtitles (translated to English, client-safe and generic).
 */
export const SECTION_BLURBS = {
  followUps:
    "Tracking the commitments made at the last review — agreed actions, owners, and current progress.",
  priorities:
    "The 2-3 most important items affecting the relationship and operations this quarter.",
  dashboard:
    "Account health at a glance across Health & Safety, Operational, and Financial indicators.",
  whatsNext:
    "Planned priorities and initiatives for the coming quarter — what's next for the account.",
} as const;

/* -------------------------------------------------------------------------- */
/* Layout grid — the single set of rules every content slide aligns to.       */
/* -------------------------------------------------------------------------- */

/** Slide canvas (16:9, inches). */
const PAGE_W = 13.333;
const PAGE_H = 7.5;

/** Master left/right margin. Every content element's left edge starts here. */
const MARGIN_X = 0.5;
/** Usable content width between the margins. */
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 12.333

/**
 * First usable Y for content, leaving a consistent gap below the white-slide
 * section title and its hairline rule. All content sections start at (or scale
 * from) this line.
 */
const CONTENT_TOP = 1.85;

/** Hanging indent so prose body aligns under the title text, not the number. */
const PROSE_INDENT = 0.34;

/**
 * Bottom band reserved for footer + page numbers. Body content must stay above
 * `contentBottom`; the footer rule and labels live inside this band.
 */
const FOOTER_BAND = 0.55;
const CONTENT_BOTTOM = PAGE_H - FOOTER_BAND; // 6.95

/** Footer label baseline + anchoring hairline rule, measured from the bottom. */
const FOOTER_BASELINE_FROM_BOTTOM = 0.36;
const FOOTER_RULE_FROM_BOTTOM = 0.5;

/* Dashboard 3-column maths — derived so the columns span CONTENT_W exactly. */
const DASH_COL_GAP = 0.2;
const DASH_COL_W = (CONTENT_W - DASH_COL_GAP * 2) / 3; // 3.978…

/**
 * The full deck theme. Grouped by slide/section. All numbers are in inches
 * (pptxgenjs units) unless they are fontSize (points) or a count.
 */
export const DECK_THEME = {
  layout: {
    name: "BR",
    width: PAGE_W,
    height: PAGE_H,
    author: "GDI BR Creation Agent",
    company: "GDI",
  },

  colors: BRAND,
  font: FONT,
  blurbs: SECTION_BLURBS,

  /**
   * The shared layout grid. Exposed so the renderer, the preview manifest, and
   * the in-browser preview can all reference the same margins/indents instead of
   * re-deriving them. Editing these values realigns every content slide at once.
   */
  grid: {
    marginX: MARGIN_X,
    contentW: CONTENT_W,
    contentTop: CONTENT_TOP,
    proseIndent: PROSE_INDENT,
    footerBand: FOOTER_BAND,
  },

  /**
   * Lower edge of the usable content area on content slides. Anything below
   * this is reserved for the footer / page-number overlays. Used to size
   * fit-to-slide prose lists and to compute table pagination capacity.
   */
  safeArea: {
    contentBottom: CONTENT_BOTTOM,
  },

  /**
   * Shared section header on the white content slide: a large blue title at the
   * top-left, with a thin hairline rule beneath it spanning the content width.
   * (No dark header bar — the slide background is white so logos sit cleanly.)
   */
  sectionHeader: {
    title: { x: MARGIN_X, y: 0.78, w: CONTENT_W, h: 0.9, fontSize: 34 },
    rule: { x: MARGIN_X, y: 1.66, w: CONTENT_W, h: 0.02 },
    subtitle: { x: MARGIN_X, y: 1.3, w: CONTENT_W, h: 0.5, fontSize: 13 },
  },

  /**
   * Thin blue band anchoring the bottom edge of the title + content slides
   * (a lighter accent line sits just above it). Mirrors the closing slide.
   */
  contentBand: { h: 0.16, accentH: 0.05 },

  /**
   * Slide 1 — Title. White background with blue/grey text and a thin yellow
   * accent rule under the client name (the co-branding lockup sits top-right and
   * a blue band anchors the bottom edge).
   */
  title: {
    accentBand: { x: MARGIN_X, y: 3.2, w: 5.5, h: 0.08 },
    clientName: { x: MARGIN_X, y: 2.2, w: 11.7, h: 1, fontSize: 46 },
    quarterYear: { x: MARGIN_X, y: 3.5, w: 11.7, h: 0.6, fontSize: 24 },
    heading: {
      x: MARGIN_X,
      y: 4.2,
      w: 11.7,
      h: 0.7,
      fontSize: 28,
      text: "Business Review",
    },
    meetingMonthYear: { x: MARGIN_X, y: 5.2, w: 11.7, h: 0.6, fontSize: 20 },
  },

  /** Slide 2 — Agenda. Number + label share the content grid (flush left). */
  agenda: {
    heading: "AGENDA",
    headingCont: "AGENDA (cont.)",
    /** Number shown beside the first agenda item. */
    startNumber: 1,
    yStart: CONTENT_TOP,
    step: 0.85,
    /** Width of the number column; the label begins right after it. */
    number: { x: MARGIN_X, w: 0.6, h: 0.6, fontSize: 24 },
    label: { x: MARGIN_X + 0.8, w: CONTENT_W - 0.8, h: 0.6, fontSize: 22 },
    fallbackItems: [
      "OPEN FOLLOW-UPS & PROGRESS",
      "PRIORITY ITEMS",
      "DASHBOARD",
      "WHAT'S NEXT",
      "QUESTIONS & DISCUSSION",
    ],
  },

  /** Slide 3 — Open Follow-Ups & Progress (paginated table). */
  followUpsTable: {
    heading: "OPEN FOLLOW-UPS & PROGRESS",
    headingCont: "OPEN FOLLOW-UPS & PROGRESS (cont.)",
    headers: ["#", "Agreed action", "Status", "Owner", "Due date"],
    emptyRow: ["—", "No open follow-ups recorded"],
    x: MARGIN_X,
    y: CONTENT_TOP,
    w: CONTENT_W,
    // Sums to CONTENT_W (12.333) so the table spans exactly margin-to-margin.
    colW: [0.6, 5.733, 1.9, 1.9, 2.2],
    /**
     * Per-column horizontal alignment, applied to BOTH the header cell and the
     * body cells so each column reads as one aligned stack. Short/enumerated
     * columns (#, status, date) center; free-text columns (action, owner) left.
     */
    colAlign: ["center", "left", "center", "left", "center"],
    rowH: 0.4,
    headerRowH: 0.46,
    headerFontSize: 13,
    bodyFontSize: 12,
    cellPad: 0.08,
  },

  /** Slide 4 — Priority Items (fit-to-slide prose list). */
  priorities: {
    heading: "PRIORITY ITEMS",
    headingCont: "PRIORITY ITEMS (cont.)",
    emptyText: "Priority items to be confirmed.",
    empty: { x: MARGIN_X, y: 2.2, w: CONTENT_W, h: 1, fontSize: 18 },
    yStart: 1.9,
    defaultStep: 1.65,
    titleOffset: 0.52,
    bottomGap: 0.18,
    minBodyH: 0.18,
    /** Hanging indent so body text aligns under the title, past the number. */
    bodyIndent: PROSE_INDENT,
    title: { x: MARGIN_X, w: CONTENT_W, h: 0.5, fontSize: 21, fontSizeMin: 13 },
    body: {
      x: MARGIN_X + PROSE_INDENT,
      w: CONTENT_W - PROSE_INDENT,
      fontSize: 15,
      fontSizeMin: 10,
    },
  },

  /** Slide 5 — Dashboard (paginated 3-column tables). */
  dashboard: {
    heading: "DASHBOARD",
    headingCont: "DASHBOARD (cont.)",
    groupTitles: {
      healthAndSafety: "Health & Safety",
      operational: "Operational",
      financial: "Financial",
    },
    emptyRow: { label: "To be confirmed" },
    colW: DASH_COL_W,
    colGap: DASH_COL_GAP,
    firstX: MARGIN_X,
    groupTitle: { y: 1.8, h: 0.5, fontSize: 17 },
    tableY: 2.4,
    rowH: 0.4,
    bodyFontSize: 12,
    labelColRatio: 0.62,
    valueColRatio: 0.38,
  },

  /** Slide 6 — What's Next (fit-to-slide prose list). */
  whatsNext: {
    heading: "WHAT'S NEXT",
    headingCont: "WHAT'S NEXT (cont.)",
    emptyText: "Upcoming items to be confirmed.",
    empty: { x: MARGIN_X, y: 2.2, w: CONTENT_W, h: 1, fontSize: 18 },
    yStart: 1.9,
    defaultStep: 1.55,
    titleOffset: 0.52,
    bottomGap: 0.23,
    minBodyH: 0.18,
    bodyIndent: PROSE_INDENT,
    title: { x: MARGIN_X, w: CONTENT_W, h: 0.5, fontSize: 21, fontSizeMin: 13 },
    body: {
      x: MARGIN_X + PROSE_INDENT,
      w: CONTENT_W - PROSE_INDENT,
      fontSize: 15,
      fontSizeMin: 10,
    },
  },

  /**
   * Slide 7 — Questions & Discussion. Closing visual: a white background with a
   * small grey "Thank you!" line above a large blue "QUESTIONS?" headline on the
   * left, a light-blue brand swoosh on the right, and the GDI employee photo
   * standing in front of the swoosh in the bottom-right. A blue band anchors the
   * bottom edge. Image aspect ratios: employee 0.852 (w/h), swoosh 0.847 (w/h).
   */
  questions: {
    headingText: "QUESTIONS?",
    thanksText: "Thank you!",
    /** Small grey lead-in line, top-left. */
    thanks: { x: 0.7, y: 0.55, w: 7, h: 0.6, fontSize: 22 },
    /** Large blue headline, left-aligned, just below the lead-in. */
    heading: { x: 0.62, y: 1.0, w: 8.6, h: 1.4, fontSize: 60 },
    /** Light-blue brand swoosh sitting behind the employee (anchored bottom-right). */
    swoosh: { wFromRight: 0.2, w: 5.6, aspect: 0.847, bottomGap: 0.18 },
    /** GDI employee photo, in front of the swoosh, anchored to the bottom edge. */
    employee: { wFromRight: 0.4, w: 5.5, aspect: 0.852, bottomGap: 0 },
    /** Blue band across the very bottom of the slide. */
    bottomBand: { h: 0.16 },
    bottomBandAccent: { h: 0.05 },
  },

  /**
   * Co-branding lockup shown in the top-right corner of the title and every
   * content slide: the client's logo (optional) to the LEFT of a thin vertical
   * divider rule, and the GDI logo to the RIGHT. Slides are white, so the marks
   * sit directly on the background with no plate behind them.
   * GDI logo aspect ratio is 5.333 (w/h).
   */
  brand: {
    /** Distance of the lockup's right edge from the slide's right edge. */
    rightMargin: 0.45,
    /** Top edge of the logos. */
    top: 0.3,
    /** GDI logo (right side of the lockup). */
    gdi: { h: 0.4, aspect: 5.333 },
    /** Thin vertical divider rule between the two logos. */
    divider: { w: 0.018, h: 0.52, color: "9AA7B4", gap: 0.18 },
    /** Client logo box (left of the divider); image is contained within it. */
    client: { boxW: 1.25, boxH: 0.56 },
  },

  /** Shared table styling (border + row striping). */
  table: {
    borderPt: 1,
  },

  /**
   * Deck-wide overlays applied post-build (page numbers / footer / tag).
   * Footer, page numbers, and the anchoring hairline rule all share one
   * baseline band so the layout is anchored rather than floating.
   */
  overlays: {
    // Footer is centered across the content width so it never collides with the
    // corner page numbers, whatever page-number position is selected.
    footer: {
      x: MARGIN_X,
      w: CONTENT_W,
      yFromBottom: FOOTER_BASELINE_FROM_BOTTOM,
      h: 0.3,
      fontSize: 9,
    },
    pageNumber: {
      leftX: MARGIN_X,
      rightXFromRight: MARGIN_X + 0.8,
      yFromBottom: FOOTER_BASELINE_FROM_BOTTOM,
      w: 0.8,
      h: 0.3,
      fontSize: 10,
    },
    /** Hairline rule that anchors the footer band across the content width. */
    rule: {
      x: MARGIN_X,
      w: CONTENT_W,
      yFromBottom: FOOTER_RULE_FROM_BOTTOM,
      h: 0.012,
    },
    tag: { xFromRight: 1.5, y: 0.12, w: 1.3, h: 0.35, fontSize: 12 },
  },

  /** DeckOptions defaults. */
  defaults: {
    pageNumberPosition: "bottom-right" as const,
  },
} as const;
