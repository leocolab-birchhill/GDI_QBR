"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DECK_THEME } from "@/lib/ppt/deckTheme";
import type { PreviewSlide, SlideSection } from "@/lib/ppt/slideManifest";

const C = DECK_THEME.colors;
const SLIDE_W = DECK_THEME.layout.width; // 13.333 in
const SLIDE_H = DECK_THEME.layout.height; // 7.5 in
const SLIDE_PT_H = SLIDE_H * 72; // 540 pt — basis for container-relative font sizes

const hex = (c: string) => `#${c}`;
const pctW = (inch: number) => `${(inch / SLIDE_W) * 100}%`;
const pctH = (inch: number) => `${(inch / SLIDE_H) * 100}%`;
/** Font size relative to slide height, so it scales with the rendered slide. */
const fpt = (pt: number) => `${(pt / SLIDE_PT_H) * 100}cqh`;

const sh = DECK_THEME.sectionHeader;

/** Short caption label for the strip above each preview slide. */
function slideLabel(slide: PreviewSlide): string {
  switch (slide.kind) {
    case "title":
      return "Title";
    case "questions":
      return "Questions & Discussion";
    default:
      return slide.heading;
  }
}

/** Thin blue band (with lighter accent line above) anchoring the bottom edge. */
function BottomBand() {
  const b = DECK_THEME.contentBand;
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: pctH(SLIDE_H - b.h - b.accentH), width: "100%", height: pctH(b.accentH), background: hex(C.secondary) }} />
      <div style={{ position: "absolute", left: 0, top: pctH(SLIDE_H - b.h), width: "100%", height: pctH(b.h), background: hex(C.primary) }} />
    </>
  );
}

/** White-slide section header: large blue title + a thin hairline rule beneath. */
function HeaderBar({ heading }: { heading: string }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: pctW(sh.title.x),
          top: pctH(sh.title.y),
          width: pctW(sh.title.w),
          height: pctH(sh.title.h),
          color: hex(C.primary),
          fontWeight: 700,
          fontSize: fpt(sh.title.fontSize),
          fontFamily: "Arial, sans-serif",
          display: "flex",
          alignItems: "center",
          lineHeight: 1,
        }}
      >
        {heading}
      </div>
      <div
        style={{ position: "absolute", left: pctW(sh.rule.x), top: pctH(sh.rule.y), width: pctW(sh.rule.w), height: pctH(sh.rule.h), background: hex(C.tableGrid) }}
      />
      <BottomBand />
    </>
  );
}

function Overlays({ slide }: { slide: PreviewSlide }) {
  const o = DECK_THEME.overlays;
  const ov = slide.overlays;
  const items: React.ReactNode[] = [];
  // Anchoring hairline rule — drawn whenever any footer-band element is shown.
  if (ov.footer || ov.pageNumber != null) {
    items.push(
      <div
        key="footer-rule"
        style={{ position: "absolute", left: pctW(o.rule.x), top: pctH(SLIDE_H - o.rule.yFromBottom), width: pctW(o.rule.w), height: pctH(o.rule.h), background: hex(C.tableGrid) }}
      />,
    );
  }
  if (ov.footer) {
    items.push(
      <div
        key="footer"
        style={{ position: "absolute", left: pctW(o.footer.x), top: pctH(SLIDE_H - o.footer.yFromBottom), width: pctW(o.footer.w), color: hex(C.greyText), fontSize: fpt(o.footer.fontSize), fontFamily: "Arial, sans-serif", textAlign: "center" }}
      >
        {ov.footer}
      </div>,
    );
  }
  if (ov.pageNumber != null) {
    const positions = ov.pageNumberPosition === "bottom-both" ? ["bottom-left", "bottom-right"] : [ov.pageNumberPosition];
    for (const p of positions) {
      items.push(
        <div
          key={`pn-${p}`}
          style={{ position: "absolute", left: p === "bottom-left" ? pctW(o.pageNumber.leftX) : pctW(SLIDE_W - o.pageNumber.rightXFromRight), top: pctH(SLIDE_H - o.pageNumber.yFromBottom), width: pctW(o.pageNumber.w), color: hex(C.greyText), fontSize: fpt(o.pageNumber.fontSize), fontFamily: "Arial, sans-serif", textAlign: p === "bottom-left" ? "left" : "right" }}
        >
          {ov.pageNumber}
        </div>,
      );
    }
  }
  if (ov.tag) {
    items.push(
      <div
        key="tag"
        style={{ position: "absolute", left: pctW(SLIDE_W - o.tag.xFromRight), top: pctH(o.tag.y), width: pctW(o.tag.w), color: hex(C.accentYellow), fontWeight: 700, fontSize: fpt(o.tag.fontSize), fontFamily: "Arial, sans-serif", textAlign: "right" }}
      >
        {ov.tag}
      </div>,
    );
  }
  if (ov.showLockup) {
    items.push(<BrandLockup key="lockup" clientLogoUrl={ov.clientLogoUrl} />);
  }
  return <>{items}</>;
}

/**
 * Top-right co-branding lockup: [client logo] │ [GDI logo], sitting directly on
 * the white slide. Every piece is positioned absolutely relative to the slide
 * (so sizes are true percentages of the slide, not of a nested container).
 */
function BrandLockup({ clientLogoUrl }: { clientLogoUrl: string | null }) {
  const b = DECK_THEME.brand;
  const gdiW = b.gdi.h * b.gdi.aspect;
  const hasClient = !!clientLogoUrl;
  const clientW = hasClient ? b.client.boxW : 0;
  const dividerBlock = hasClient ? b.divider.gap + b.divider.w + b.divider.gap : 0;
  const lockupW = clientW + dividerBlock + gdiW;
  const midY = b.top + Math.max(b.gdi.h, b.client.boxH, b.divider.h) / 2;

  const items: React.ReactNode[] = [];
  let x = SLIDE_W - b.rightMargin - lockupW;
  if (hasClient) {
    items.push(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key="client"
        src={clientLogoUrl!}
        alt="client logo"
        style={{ position: "absolute", left: pctW(x), top: pctH(midY - b.client.boxH / 2), width: pctW(b.client.boxW), height: pctH(b.client.boxH), objectFit: "contain" }}
      />,
    );
    x += clientW + b.divider.gap;
    items.push(
      <div
        key="divider"
        style={{ position: "absolute", left: pctW(x), top: pctH(midY - b.divider.h / 2), width: pctW(b.divider.w), height: pctH(b.divider.h), background: hex(b.divider.color) }}
      />,
    );
    x += b.divider.w + b.divider.gap;
  }
  items.push(
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key="gdi"
      src="/brand/gdi-logo-slide.png"
      alt="GDI"
      style={{ position: "absolute", left: pctW(x), top: pctH(midY - b.gdi.h / 2), width: pctW(gdiW), height: pctH(b.gdi.h), objectFit: "contain" }}
    />,
  );
  return <>{items}</>;
}

function SlideBody({ slide }: { slide: PreviewSlide }) {
  switch (slide.kind) {
    case "title": {
      const t = DECK_THEME.title;
      return (
        <>
          <div style={{ position: "absolute", inset: 0, background: hex(C.white) }} />
          <Abs x={t.clientName.x} y={t.clientName.y} w={t.clientName.w} color={C.primary} pt={t.clientName.fontSize} bold>
            {slide.clientName}
          </Abs>
          <div style={{ position: "absolute", left: pctW(t.accentBand.x), top: pctH(t.accentBand.y), width: pctW(t.accentBand.w), height: pctH(t.accentBand.h), background: hex(C.accentYellow) }} />
          <Abs x={t.quarterYear.x} y={t.quarterYear.y} w={t.quarterYear.w} color={C.secondary} pt={t.quarterYear.fontSize} bold>
            {slide.quarterYear}
          </Abs>
          <Abs x={t.heading.x} y={t.heading.y} w={t.heading.w} color={C.primary} pt={t.heading.fontSize} bold>
            {slide.headingText}
          </Abs>
          <Abs x={t.meetingMonthYear.x} y={t.meetingMonthYear.y} w={t.meetingMonthYear.w} color={C.greyText} pt={t.meetingMonthYear.fontSize}>
            {slide.meetingMonthYear}
          </Abs>
          <BottomBand />
        </>
      );
    }
    case "agenda": {
      const a = DECK_THEME.agenda;
      return (
        <>
          <HeaderBar heading={slide.heading} />
          {slide.items.map((it, i) => {
            const y = a.yStart + i * a.step;
            return (
              <div key={i}>
                <Abs x={a.number.x} y={y} w={a.number.w} color={C.secondary} pt={a.number.fontSize} bold align="center">
                  {it.number}
                </Abs>
                <Abs x={a.label.x} y={y} w={a.label.w} color={C.primary} pt={a.label.fontSize} bold>
                  {it.label}
                </Abs>
              </div>
            );
          })}
        </>
      );
    }
    case "table": {
      const ft = DECK_THEME.followUpsTable;
      const align = (i: number) => (ft.colAlign[i] ?? "left") as "left" | "center" | "right";
      return (
        <>
          <HeaderBar heading={slide.heading} />
          <div style={{ position: "absolute", left: pctW(ft.x), top: pctH(ft.y), width: pctW(ft.w) }}>
            <div style={{ display: "flex", background: hex(C.primary) }}>
              {slide.headers.map((h, i) => (
                <div key={i} style={{ width: `${slide.colPct[i]}%`, color: hex(C.white), fontWeight: 700, fontSize: fpt(ft.headerFontSize), fontFamily: "Arial, sans-serif", padding: "0.6cqh 0.6cqh", boxSizing: "border-box", borderRight: `1px solid ${hex(C.tableGrid)}`, textAlign: align(i) }}>
                  {h}
                </div>
              ))}
            </div>
            {slide.rows.map((row, r) => (
              <div key={r} style={{ display: "flex", background: r % 2 ? hex(C.rowAltFill) : hex(C.white) }}>
                {row.map((cell, i) => (
                  <div key={i} style={{ width: `${slide.colPct[i]}%`, color: i === 0 ? hex(C.secondary) : hex(C.text), fontWeight: i === 0 ? 700 : 400, fontSize: fpt(ft.bodyFontSize), fontFamily: "Arial, sans-serif", padding: "0.4cqh 0.6cqh", boxSizing: "border-box", borderRight: `1px solid ${hex(C.tableGrid)}`, borderBottom: `1px solid ${hex(C.tableGrid)}`, overflow: "hidden", textOverflow: "ellipsis", textAlign: align(i) }}>
                    {cell}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      );
    }
    case "prose": {
      const cfg = slide.section === "priorities" ? DECK_THEME.priorities : DECK_THEME.whatsNext;
      return (
        <>
          <HeaderBar heading={slide.heading} />
          {slide.items.length === 0 ? (
            <Abs x={cfg.empty.x} y={cfg.empty.y} w={cfg.empty.w} color={C.greyText} pt={cfg.empty.fontSize}>
              {cfg.emptyText}
            </Abs>
          ) : (
            <div style={{ position: "absolute", left: pctW(cfg.title.x), top: pctH(cfg.yStart), width: pctW(cfg.title.w), right: pctW(SLIDE_W - cfg.title.x - cfg.title.w) }}>
              {slide.items.map((it, i) => (
                <div key={i} style={{ marginBottom: "1.6cqh" }}>
                  <div style={{ fontSize: fpt(slide.titleFontPt), fontFamily: "Arial, sans-serif", lineHeight: 1.1 }}>
                    <span style={{ color: hex(C.secondary), fontWeight: 700 }}>{it.number}.&nbsp;&nbsp;</span>
                    <span style={{ color: hex(C.primary), fontWeight: 700 }}>{it.title}</span>
                  </div>
                  <div style={{ color: hex(C.text), fontSize: fpt(slide.bodyFontPt), fontFamily: "Arial, sans-serif", lineHeight: 1.25, marginTop: "0.6cqh", paddingLeft: pctW(cfg.bodyIndent) }}>
                    {it.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      );
    }
    case "dashboard": {
      const d = DECK_THEME.dashboard;
      return (
        <>
          <HeaderBar heading={slide.heading} />
          {slide.columns.map((col, i) => {
            const x = d.firstX + i * (d.colW + d.colGap);
            return (
              <div key={i}>
                <div style={{ position: "absolute", left: pctW(x), top: pctH(d.groupTitle.y), width: pctW(d.colW), height: pctH(d.groupTitle.h), background: hex(C.secondary), color: hex(C.white), fontWeight: 700, fontSize: fpt(d.groupTitle.fontSize), fontFamily: "Arial, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {col.title}
                </div>
                <div style={{ position: "absolute", left: pctW(x), top: pctH(d.tableY), width: pctW(d.colW) }}>
                  {col.rows.map((row, r) => (
                    <div key={r} style={{ display: "flex", background: r % 2 ? hex(C.rowAltFill) : hex(C.white) }}>
                      <div style={{ width: `${d.labelColRatio * 100}%`, color: hex(C.text), fontSize: fpt(d.bodyFontSize), fontFamily: "Arial, sans-serif", padding: "0.4cqh 0.6cqh", boxSizing: "border-box", borderRight: `1px solid ${hex(C.tableGrid)}`, borderBottom: `1px solid ${hex(C.tableGrid)}` }}>
                        {row.label}
                      </div>
                      <div style={{ width: `${d.valueColRatio * 100}%`, color: hex(C.primary), fontWeight: 700, fontSize: fpt(d.bodyFontSize), fontFamily: "Arial, sans-serif", padding: "0.4cqh 0.6cqh", boxSizing: "border-box", textAlign: "right", borderBottom: `1px solid ${hex(C.tableGrid)}` }}>
                        {row.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      );
    }
    case "questions": {
      const q = DECK_THEME.questions;
      const swW = q.swoosh.w;
      const swH = swW / q.swoosh.aspect;
      const emW = q.employee.w;
      const emH = emW / q.employee.aspect;
      return (
        <>
          <div style={{ position: "absolute", inset: 0, background: hex(C.white) }} />
          {/* Light-blue swoosh behind the employee, anchored bottom-right. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/gdi-swoosh.png"
            alt=""
            style={{ position: "absolute", left: pctW(SLIDE_W - q.swoosh.wFromRight - swW), top: pctH(SLIDE_H - q.swoosh.bottomGap - swH), width: pctW(swW), height: pctH(swH), objectFit: "contain" }}
          />
          {/* GDI employee, in front of the swoosh, anchored to the bottom edge. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/gdi-employee.png"
            alt="GDI employee"
            style={{ position: "absolute", left: pctW(SLIDE_W - q.employee.wFromRight - emW), top: pctH(SLIDE_H - q.employee.bottomGap - emH), width: pctW(emW), height: pctH(emH), objectFit: "contain" }}
          />
          <Abs x={q.thanks.x} y={q.thanks.y} w={q.thanks.w} color={C.greyText} pt={q.thanks.fontSize} align="left">
            {slide.thanksText}
          </Abs>
          <Abs x={q.heading.x} y={q.heading.y} w={q.heading.w} color={C.primary} pt={q.heading.fontSize} bold align="left">
            {slide.headingText}
          </Abs>
          {/* Blue band anchoring the bottom edge. */}
          <div style={{ position: "absolute", left: 0, top: pctH(SLIDE_H - q.bottomBand.h - q.bottomBandAccent.h), width: "100%", height: pctH(q.bottomBandAccent.h), background: hex(C.secondary) }} />
          <div style={{ position: "absolute", left: 0, top: pctH(SLIDE_H - q.bottomBand.h), width: "100%", height: pctH(q.bottomBand.h), background: hex(C.primary) }} />
        </>
      );
    }
  }
}

/** Absolutely positioned text box, sized in slide inches with pt-scaled font. */
function Abs({
  x,
  y,
  w,
  color,
  pt,
  bold,
  align,
  children,
}: {
  x: number;
  y: number;
  w: number;
  color: string;
  pt: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: pctW(x),
        top: pctH(y),
        width: pctW(w),
        color: hex(color),
        fontWeight: bold ? 700 : 400,
        fontSize: fpt(pt),
        fontFamily: "Arial, sans-serif",
        textAlign: align ?? "left",
        lineHeight: 1.1,
      }}
    >
      {children}
    </div>
  );
}

/** Renders one slide at whatever size its container provides (container queries scale type). */
function SlideCanvas({ slide, className = "" }: { slide: PreviewSlide; className?: string }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${SLIDE_W} / ${SLIDE_H}`,
        containerType: "size",
        background: hex(C.white),
        overflow: "hidden",
        borderRadius: 4,
      }}
      className={className}
    >
      <SlideBody slide={slide} />
      <Overlays slide={slide} />
    </div>
  );
}

function SlideLightbox({
  slide,
  slideCount,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  slide: PreviewSlide;
  slideCount: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onPrev();
      else if (e.key === "ArrowRight" && hasNext) onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Slide ${slide.index} expanded view`}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-5xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3 text-sm text-white/90">
          <span>
            Slide {slide.index} of {slideCount} · {slideLabel(slide)}
            {slide.continuation ? " (cont.)" : ""}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close expanded view"
          >
            Close ✕
          </button>
        </div>

        <div className="relative">
          {hasPrev && (
            <button
              type="button"
              onClick={onPrev}
              className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 px-2 py-1.5 text-base font-semibold text-primary shadow-md hover:bg-white sm:-left-12 sm:px-2.5 sm:py-2 sm:text-lg"
              aria-label="Previous slide"
            >
              ‹
            </button>
          )}
          <SlideCanvas slide={slide} className="shadow-2xl ring-1 ring-white/20" />
          {hasNext && (
            <button
              type="button"
              onClick={onNext}
              className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 px-2 py-1.5 text-base font-semibold text-primary shadow-md hover:bg-white sm:-right-12 sm:px-2.5 sm:py-2 sm:text-lg"
              aria-label="Next slide"
            >
              ›
            </button>
          )}
        </div>

        <p className="mt-2 text-center text-[11px] text-white/60">
          ← → to navigate · Esc to close · click outside to dismiss
        </p>
      </div>
    </div>
  );
}

export default function DeckPreview({
  slides,
  highlightSection,
  scrollToken,
  onSelectSlide,
}: {
  slides: PreviewSlide[];
  highlightSection: SlideSection | null;
  scrollToken: number;
  onSelectSlide?: (section: SlideSection) => void;
}) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const closeLightbox = useCallback(() => setExpandedIndex(null), []);
  const goPrev = useCallback(() => {
    setExpandedIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);
  const goNext = useCallback(() => {
    setExpandedIndex((i) => (i !== null && i < slides.length - 1 ? i + 1 : i));
  }, [slides.length]);

  useEffect(() => {
    if (!highlightSection) return;
    const idx = slides.findIndex((s) => s.section === highlightSection);
    if (idx >= 0) refs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollToken, highlightSection, slides]);

  // Close the lightbox if the deck shrinks (e.g. after a content edit).
  useEffect(() => {
    if (expandedIndex !== null && expandedIndex >= slides.length) {
      setExpandedIndex(null);
    }
  }, [expandedIndex, slides.length]);

  if (slides.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No deck generated yet. Once a draft exists, every slide appears here and updates live as you edit.
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-y-auto rounded-md border bg-muted/30 p-3">
        <p className="mb-3 text-[11px] text-muted-foreground">Single-click a slide to jump to it · double-click (or ⤢ Expand) to enlarge</p>
        <div className="space-y-4">
          {slides.map((slide, i) => {
            const isHighlight = highlightSection != null && slide.section === highlightSection;
            const expand = () => {
              onSelectSlide?.(slide.section);
              setExpandedIndex(i);
            };
            return (
              <div
                key={`${slide.index}-${slide.section}`}
                ref={(el) => {
                  refs.current[i] = el;
                }}
              >
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    Slide {slide.index} · {slideLabel(slide)}
                    {slide.continuation ? " (cont.)" : ""}
                  </span>
                  {isHighlight && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      selected
                    </span>
                  )}
                </div>
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelectSlide?.(slide.section)}
                    onDoubleClick={expand}
                    className={`block w-full cursor-pointer text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                      isHighlight ? "ring-2 ring-primary ring-offset-1" : ""
                    }`}
                    aria-label={`Go to slide ${slide.index}: ${slideLabel(slide)}. Double-click to expand.`}
                  >
                    <SlideCanvas
                      slide={slide}
                      className={`shadow-sm ring-1 ring-border transition-shadow group-hover:shadow-md group-hover:ring-primary/40 ${isHighlight ? "ring-primary" : ""}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={expand}
                    className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-md bg-primary/85 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground opacity-80 shadow-sm transition-all hover:bg-primary hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 group-hover:opacity-100"
                    aria-label={`Expand slide ${slide.index}: ${slideLabel(slide)}`}
                  >
                    ⤢ Expand
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {expandedIndex !== null && slides[expandedIndex] && (
        <SlideLightbox
          slide={slides[expandedIndex]}
          slideCount={slides.length}
          onClose={closeLightbox}
          onPrev={goPrev}
          onNext={goNext}
          hasPrev={expandedIndex > 0}
          hasNext={expandedIndex < slides.length - 1}
        />
      )}
    </>
  );
}
