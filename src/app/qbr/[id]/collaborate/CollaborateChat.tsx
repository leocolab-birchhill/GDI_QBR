"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import type { SlideContent, SlideEditOp, DeckPatch } from "@/lib/ai/schemas";
import { METRIC_GROUPS } from "@/lib/constants";
import type { DeckOptions } from "@/lib/ppt/generateQbrDeck";
import { buildDeckManifest, resolveDeckSequence, type SlideSection } from "@/lib/ppt/slideManifest";
import {
  buildReorderItems,
  computeReorderPatches,
  isPinnedReorderItem,
  moveReorderItem,
  type ReorderItem,
} from "@/lib/qbr/deckReorder";
import {
  GUIDED_SECTIONS,
  getStrings,
  localizeSlideContentForLocale,
  type EditorProgress,
  type GuidedSection,
  type Locale,
} from "@/lib/i18n";
import { getSectionGuidance, getSectionReview, sectionChatPlaceholder } from "@/lib/qbr/sectionGuidance";
import DeckPreview from "./DeckPreview";
import DeckLanguageToggle from "./DeckLanguageToggle";
import AgentTaskCard from "./AgentTaskCard";
import { useAgentProposal } from "./useAgentProposal";

interface DeckRef {
  fileUrl: string;
  versionNumber: number;
}

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  text: string;
  section?: string;
  actorName?: string;
  applied?: string[];
  deck?: DeckRef | null;
  suggestions?: string[];
}

interface ChangeActivity {
  id: string;
  status: string;
  section?: string | null;
  actorName?: string | null;
  message?: string | null;
  createdAt: string;
  revertsId?: string | null;
}

type ThreadScope = "section" | "all";
type EditorTab = "editor" | "activity";
type RailKey = GuidedSection | `custom:${string}`;

function railKeyForSection(section: GuidedSection): RailKey {
  return section;
}

function railKeyForCustom(id: string): RailKey {
  return `custom:${id}`;
}

function isCustomRailKey(key: RailKey): key is `custom:${string}` {
  return key.startsWith("custom:");
}

function EditorCapabilities({ locale }: { locale: Locale }) {
  const c = getStrings(locale).editor.capabilities;
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block text-xs">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
        title={c.title}
        aria-label={c.title}
        aria-expanded={open}
      >
        ?
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label={locale === "fr" ? "Fermer l'aide" : "Close help"}
            className="fixed inset-0 z-[90] cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="fixed right-4 top-20 z-[100] w-[min(30rem,calc(100vw-2rem))] rounded-lg border bg-white text-slate-950 opacity-100 shadow-2xl ring-1 ring-black/10 dark:bg-slate-950 dark:text-slate-50">
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2 font-medium text-foreground">
              <span>{c.title}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ×
              </button>
            </div>
            <div className="grid gap-3 px-3 py-3 text-slate-700 dark:text-slate-200 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 font-semibold text-gdi-green">{c.can}</p>
                <ul className="space-y-1 text-slate-700 dark:text-slate-200">
                  {c.canItems.map((item, i) => (
                    <li key={i}>· {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 font-semibold text-amber-800">{c.cant}</p>
                <ul className="space-y-1 text-slate-700 dark:text-slate-200">
                  {c.cantItems.map((item, i) => (
                    <li key={i}>· {item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="border-t px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">{c.capacityNote}</p>
          </div>
        </>
      )}
    </div>
  );
}

type SlideStatus = "in_progress" | "complete" | "needs_review";

interface FollowUpRow {
  id: string;
  /** DB row id (from content) — the reliable target for edit/remove ops. */
  itemId?: string;
  originalAction?: string;
  agreedAction: string;
  status: string;
  owner: string;
  dueDate: string;
}

/**
 * Stable identity of a row loaded from the server: DB id when the snapshot
 * carries one, otherwise the display text. New (unsaved) rows have none.
 */
function savedRowKey(row: { itemId?: string }, originalText?: string): string | undefined {
  if (row.itemId) return `id:${row.itemId}`;
  return originalText ? `text:${originalText}` : undefined;
}

const UNSET_OWNER_SENTINELS = new Set(["to confirm", "à confirmer", "a confirmer"]);

function ownerFromDisplay(owner: string | undefined): string {
  const o = (owner ?? "").trim();
  return UNSET_OWNER_SENTINELS.has(o.toLowerCase()) ? "" : o;
}

function newRowId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isConfirmDate(value: string, locale: Locale): boolean {
  const confirm = getStrings(locale).toConfirm;
  return !value.trim() || value === confirm || value === "To confirm" || value === "À confirmer";
}

function followUpsFromContent(content: SlideContent | null): FollowUpRow[] {
  if (!content?.followUps.length) return [];
  return content.followUps.map((f) => ({
    id: newRowId(),
    itemId: f.id,
    originalAction: f.action,
    agreedAction: f.action,
    status: f.status || "Open",
    owner: ownerFromDisplay(f.owner),
    // Prefer the ISO date so the date input actually shows the stored value
    // (the display string is a localized long date the input can't parse).
    dueDate: f.dueDateIso || f.dueDate || "",
  }));
}

function followUpRowsEqual(a: FollowUpRow[], b: FollowUpRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    return (
      row.agreedAction === other.agreedAction &&
      row.status === other.status &&
      row.owner === other.owner &&
      row.dueDate === other.dueDate &&
      row.itemId === other.itemId &&
      row.originalAction === other.originalAction
    );
  });
}

/**
 * Due-date op value: ISO sets it, empty string clears it, anything else
 * ("To confirm" sentinel or an unparsed legacy display date) keeps the current.
 */
function dueDateOpValue(dueDate: string): string | undefined {
  if (isIsoDate(dueDate)) return dueDate;
  if (!dueDate.trim()) return "";
  return undefined;
}

function buildFollowUpOps(saved: FollowUpRow[], draft: FollowUpRow[]): SlideEditOp[] {
  const ops: SlideEditOp[] = [];
  const keyOf = (r: FollowUpRow) => savedRowKey(r, r.originalAction);
  const draftKeys = new Set(draft.map(keyOf).filter(Boolean));

  for (const row of saved) {
    const key = keyOf(row);
    if (key && !draftKeys.has(key)) {
      ops.push({ type: "remove_commitment", itemId: row.itemId, action: row.originalAction });
    }
  }

  for (const row of draft) {
    const action = row.agreedAction.trim();
    if (!action) continue;
    const key = keyOf(row);
    const savedRow = key ? saved.find((s) => keyOf(s) === key) : undefined;
    if (!savedRow) {
      ops.push({
        type: "add_commitment",
        action,
        status: row.status,
        owner: row.owner.trim() || undefined,
        date: isIsoDate(row.dueDate) ? row.dueDate : undefined,
      });
      continue;
    }
    if (savedRow.agreedAction !== action) {
      // The action text is the row's headline — rewrite it as remove + add so
      // the server stores the user's exact new wording.
      ops.push({ type: "remove_commitment", itemId: row.itemId, action: row.originalAction });
      ops.push({
        type: "add_commitment",
        action,
        status: row.status,
        owner: row.owner.trim() || undefined,
        date: isIsoDate(row.dueDate) ? row.dueDate : undefined,
      });
      continue;
    }
    if (
      savedRow.status !== row.status ||
      savedRow.owner !== row.owner ||
      savedRow.dueDate !== row.dueDate
    ) {
      ops.push({
        type: "set_commitment_status",
        itemId: row.itemId,
        action: row.originalAction,
        status: row.status,
        // Empty string explicitly clears the owner on the server.
        owner: row.owner.trim(),
        date: dueDateOpValue(row.dueDate),
      });
    }
  }
  return ops;
}

/** A numbered title + body row shared by the Priority Items and What's Next lists. */
interface ProseRow {
  id: string;
  /** DB row id (from content) — the reliable target for edit/remove ops. */
  itemId?: string;
  /** The item's title at load time; used to target edit/remove ops. Absent = new row. */
  originalTitle?: string;
  title: string;
  body: string;
}

interface MetricRow {
  id: string;
  /** DB row id (from content) — the reliable target for edit/remove ops. */
  itemId?: string;
  originalLabel?: string;
  group: string;
  label: string;
  value: string;
}

function prioritiesFromContent(content: SlideContent | null): ProseRow[] {
  return (content?.priorityItems ?? []).map((p) => ({
    id: newRowId(),
    itemId: p.id,
    originalTitle: p.title,
    title: p.title,
    body: p.explanation,
  }));
}

function upcomingFromContent(content: SlideContent | null): ProseRow[] {
  return (content?.whatsNext ?? []).map((u) => ({
    id: newRowId(),
    itemId: u.id,
    originalTitle: u.title,
    title: u.title,
    body: u.detail,
  }));
}

function metricsFromContent(content: SlideContent | null): MetricRow[] {
  if (!content) return [];
  const d = content.dashboard;
  const out: MetricRow[] = [];
  const push = (group: string, rows: { id?: string; label: string; value: string }[]) => {
    for (const r of rows)
      out.push({ id: newRowId(), itemId: r.id, originalLabel: r.label, group, label: r.label, value: r.value });
  };
  push("Health & Safety", d.healthAndSafety);
  push("Operational", d.operational);
  push("Financial", d.financial);
  for (const g of d.customGroups ?? []) push(g.title, g.rows);
  return out;
}

/** The standard, non-removable dashboard categories (always shown on the deck). */
const STANDARD_CATEGORIES: string[] = [...METRIC_GROUPS];

/**
 * All categories available in the editor: the standard three, every custom
 * group present in the deck (including empty ones — they still render a slide
 * column), and any group referenced by a metric row.
 */
function categoriesFromContent(content: SlideContent | null): string[] {
  const fromGroups = (content?.dashboard.customGroups ?? []).map((g) => g.title);
  const fromRows = metricsFromContent(content).map((r) => r.group);
  return Array.from(new Set([...STANDARD_CATEGORIES, ...fromGroups, ...fromRows]));
}

function proseRowsEqual(a: ProseRow[], b: ProseRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) =>
      row.title === b[i].title && row.body === b[i].body && row.itemId === b[i].itemId && row.originalTitle === b[i].originalTitle,
  );
}

function metricRowsEqual(a: MetricRow[], b: MetricRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) =>
      row.group === b[i].group &&
      row.label === b[i].label &&
      row.value === b[i].value &&
      row.itemId === b[i].itemId &&
      row.originalLabel === b[i].originalLabel,
  );
}

function stringSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((item) => setB.has(item));
}

/** Diff saved vs draft prose rows into add/remove ops (edits become remove+add). */
function buildProseOps(
  saved: ProseRow[],
  draft: ProseRow[],
  addType: "add_priority" | "add_upcoming",
  removeType: "remove_priority" | "remove_upcoming",
): SlideEditOp[] {
  const ops: SlideEditOp[] = [];
  const keyOf = (r: ProseRow) => savedRowKey(r, r.originalTitle);
  const draftKeys = new Set(draft.map(keyOf).filter(Boolean));
  for (const row of saved) {
    const key = keyOf(row);
    if (key && !draftKeys.has(key)) {
      ops.push({ type: removeType, itemId: row.itemId, title: row.originalTitle });
    }
  }
  for (const row of draft) {
    const title = row.title.trim();
    if (!title) continue;
    const body = row.body.trim() || undefined;
    const addOp: SlideEditOp =
      addType === "add_priority"
        ? { type: "add_priority", title, explanation: body }
        : { type: "add_upcoming", title, detail: body };
    const key = keyOf(row);
    const savedRow = key ? saved.find((s) => keyOf(s) === key) : undefined;
    if (!savedRow) {
      ops.push(addOp);
      continue;
    }
    if (savedRow.title !== title || savedRow.body !== row.body) {
      ops.push({ type: removeType, itemId: row.itemId, title: row.originalTitle });
      ops.push(addOp);
    }
  }
  return ops;
}

function buildMetricOps(saved: MetricRow[], draft: MetricRow[]): SlideEditOp[] {
  const ops: SlideEditOp[] = [];
  const keyOf = (r: MetricRow) => savedRowKey(r, r.originalLabel);
  const draftKeys = new Set(draft.map(keyOf).filter(Boolean));
  for (const row of saved) {
    const key = keyOf(row);
    if (key && !draftKeys.has(key)) {
      ops.push({ type: "remove_metric", itemId: row.itemId, label: row.originalLabel });
    }
  }
  for (const row of draft) {
    const label = row.label.trim();
    if (!label) continue;
    const group = row.group.trim() || "Operational";
    const value = row.value.trim() || undefined;
    const key = keyOf(row);
    const savedRow = key ? saved.find((s) => keyOf(s) === key) : undefined;
    if (!savedRow) {
      ops.push({ type: "set_metric", group, label, value });
      continue;
    }
    if (savedRow.label !== label && !row.itemId) {
      // No row id to rename against — replace by text.
      ops.push({ type: "remove_metric", label: row.originalLabel });
      ops.push({ type: "set_metric", group, label, value });
    } else if (savedRow.label !== label || savedRow.group !== row.group || savedRow.value !== row.value) {
      // set_metric with an itemId updates (and can rename) the exact row.
      ops.push({ type: "set_metric", itemId: row.itemId, group, label, value });
    }
  }
  return ops;
}

function getSlideStatus(section: GuidedSection, progress: EditorProgress): SlideStatus {
  if (progress.confirmedSections.includes(section)) return "complete";
  if (progress.currentSection === section) return "in_progress";
  return "needs_review";
}

function DueDateInput({
  value,
  onChange,
  locale,
  inputClass,
}: {
  value: string;
  onChange: (v: string) => void;
  locale: Locale;
  inputClass: string;
}) {
  const confirm = getStrings(locale).toConfirm;
  if (isConfirmDate(value, locale)) {
    return (
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={confirm}
      />
    );
  }
  return (
    <input
      type="date"
      className={inputClass}
      value={isIsoDate(value) ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function FollowUpsTable({
  rows,
  locale,
  onChange,
  onAdd,
  onRemove,
}: {
  rows: FollowUpRow[];
  locale: Locale;
  onChange: (rows: FollowUpRow[]) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const s = getStrings(locale);
  const inputClass = "w-full min-w-0 rounded-md border bg-background px-2 py-1.5 text-xs";
  const cols = s.editor.tableColumns;

  function updateRow(id: string, patch: Partial<FollowUpRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2">{cols.agreedAction}</th>
              <th className="w-28 px-2 py-2">{cols.status}</th>
              <th className="w-32 px-2 py-2">{cols.owner}</th>
              <th className="w-36 px-2 py-2">{cols.dueDate}</th>
              <th className="w-20 px-2 py-2">{cols.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                  {locale === "fr" ? "Aucun engagement — ajoutez-en un ci-dessous." : "No follow-ups yet — add one below."}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0">
                <td className="px-2 py-2 align-top">
                  <input
                    className={inputClass}
                    value={row.agreedAction}
                    onChange={(e) => updateRow(row.id, { agreedAction: e.target.value })}
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <select
                    className={inputClass}
                    value={row.status}
                    onChange={(e) => updateRow(row.id, { status: e.target.value })}
                  >
                    {/* Keep the row's own status selectable (e.g. localized "Ouvert"). */}
                    {!["Open", "In Progress", "Complete"].includes(row.status) && (
                      <option value={row.status}>{row.status}</option>
                    )}
                    <option>Open</option>
                    <option>In Progress</option>
                    <option>Complete</option>
                  </select>
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    className={inputClass}
                    value={row.owner}
                    onChange={(e) => updateRow(row.id, { owner: e.target.value })}
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <DueDateInput
                    value={row.dueDate}
                    onChange={(v) => updateRow(row.id, { dueDate: v })}
                    locale={locale}
                    inputClass={inputClass}
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    className="text-xs font-medium text-destructive hover:underline"
                  >
                    {s.editor.removeRow}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="text-xs font-medium text-primary hover:underline"
      >
        {s.editor.addFollowUp}
      </button>
    </div>
  );
}

function ProseList({
  rows,
  locale,
  titleLabel,
  bodyLabel,
  bodyPlaceholder,
  addLabel,
  emptyText,
  onChange,
  onAdd,
  onRemove,
}: {
  rows: ProseRow[];
  locale: Locale;
  titleLabel: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  addLabel: string;
  emptyText: string;
  onChange: (rows: ProseRow[]) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const s = getStrings(locale);
  const inputClass = "w-full min-w-0 rounded-md border bg-background px-2 py-1.5 text-xs";
  const fieldLabel = "text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

  function updateRow(id: string, patch: Partial<ProseRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li key={row.id} className="rounded-md border bg-background/60 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-secondary">#{i + 1}</span>
                <button
                  type="button"
                  onClick={() => onRemove(row.id)}
                  className="text-[11px] font-medium text-destructive hover:underline"
                >
                  {s.editor.removeRow}
                </button>
              </div>
              <div className="grid gap-2">
                <label className="grid gap-1">
                  <span className={fieldLabel}>{titleLabel}</span>
                  <input
                    className={inputClass}
                    value={row.title}
                    onChange={(e) => updateRow(row.id, { title: e.target.value })}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={fieldLabel}>{bodyLabel}</span>
                  <input
                    className={inputClass}
                    value={row.body}
                    placeholder={bodyPlaceholder}
                    onChange={(e) => updateRow(row.id, { body: e.target.value })}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onAdd} className="text-xs font-medium text-primary hover:underline">
        {addLabel}
      </button>
    </div>
  );
}

function MetricList({
  rows,
  locale,
  categories,
  onChange,
  onAdd,
  onRemove,
  onAddCategory,
  onRemoveCategory,
}: {
  rows: MetricRow[];
  locale: Locale;
  categories: string[];
  onChange: (rows: MetricRow[]) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onAddCategory: (name: string) => void;
  onRemoveCategory: (name: string) => void;
}) {
  const s = getStrings(locale);
  const [newCategory, setNewCategory] = useState("");
  const inputClass = "w-full min-w-0 rounded-md border bg-background px-2 py-1.5 text-xs";

  function updateRow(id: string, patch: Partial<MetricRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function submitCategory() {
    const name = newCategory.trim();
    if (!name) return;
    onAddCategory(name);
    setNewCategory("");
  }

  const countByCategory = (name: string) => rows.filter((r) => r.group === name).length;

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/20 p-2.5">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {locale === "fr" ? "Catégories" : "Categories"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => {
            const removable = !STANDARD_CATEGORIES.includes(cat);
            return (
              <span
                key={cat}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] text-foreground"
              >
                {cat}
                <span className="text-[10px] text-muted-foreground">({countByCategory(cat)})</span>
                {removable && (
                  <button
                    type="button"
                    onClick={() => onRemoveCategory(cat)}
                    className="text-destructive hover:text-destructive/80"
                    title={locale === "fr" ? "Supprimer la catégorie et ses indicateurs" : "Remove category and its metrics"}
                    aria-label={`Remove category ${cat}`}
                  >
                    ✕
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <input
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs"
            value={newCategory}
            placeholder={locale === "fr" ? "Nouvelle catégorie (ex. Satisfaction)" : "New category (e.g. Satisfaction)"}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitCategory();
              }
            }}
          />
          <button
            type="button"
            onClick={submitCategory}
            disabled={!newCategory.trim()}
            className="whitespace-nowrap rounded-md border bg-background px-2 py-1.5 text-xs font-medium text-primary hover:bg-accent disabled:opacity-40"
          >
            {locale === "fr" ? "+ Catégorie" : "+ Category"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-40 px-2 py-2">{locale === "fr" ? "Catégorie" : "Category"}</th>
              <th className="px-2 py-2">{locale === "fr" ? "Indicateur" : "Metric"}</th>
              <th className="w-28 px-2 py-2">{locale === "fr" ? "Valeur" : "Value"}</th>
              <th className="w-16 px-2 py-2">{s.editor.tableColumns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                  {locale === "fr" ? "Aucun indicateur — ajoutez-en un ci-dessous." : "No metrics yet — add one below."}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0">
                <td className="px-2 py-2 align-top">
                  <select
                    className={inputClass}
                    value={row.group}
                    onChange={(e) => updateRow(row.id, { group: e.target.value })}
                  >
                    {/* Keep the row's own group selectable even if it isn't in the known list. */}
                    {!categories.includes(row.group) && <option value={row.group}>{row.group}</option>}
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2 align-top">
                  <input className={inputClass} value={row.label} onChange={(e) => updateRow(row.id, { label: e.target.value })} />
                </td>
                <td className="px-2 py-2 align-top">
                  <input className={inputClass} value={row.value} onChange={(e) => updateRow(row.id, { value: e.target.value })} />
                </td>
                <td className="px-2 py-2 align-top">
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    className="text-[11px] font-medium text-destructive hover:underline"
                  >
                    {s.editor.removeRow}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={onAdd} className="text-xs font-medium text-primary hover:underline">
        {locale === "fr" ? "+ Ajouter un indicateur" : "+ Add metric"}
      </button>
    </div>
  );
}

function SlideFormContent({
  section,
  locale,
  content,
  clientName,
  initialMeetingDate,
  resetToken,
  onDirtyChange,
  registerCollector,
}: {
  section: GuidedSection;
  locale: Locale;
  content: SlideContent | null;
  clientName: string;
  initialMeetingDate: string;
  resetToken: number;
  onDirtyChange: (dirty: boolean) => void;
  registerCollector: (fn: () => SlideEditOp[]) => void;
}) {
  const [titleClient, setTitleClient] = useState(clientName);
  const [meetingDate, setMeetingDate] = useState(initialMeetingDate);
  const [agendaText, setAgendaText] = useState(content?.agenda.join("\n") ?? "");
  const [followUpRows, setFollowUpRows] = useState<FollowUpRow[]>(() => followUpsFromContent(content));
  const [savedFollowUpRows, setSavedFollowUpRows] = useState<FollowUpRow[]>(() => followUpsFromContent(content));
  const [priorityRows, setPriorityRows] = useState<ProseRow[]>(() => prioritiesFromContent(content));
  const [savedPriorityRows, setSavedPriorityRows] = useState<ProseRow[]>(() => prioritiesFromContent(content));
  const [upcomingRows, setUpcomingRows] = useState<ProseRow[]>(() => upcomingFromContent(content));
  const [savedUpcomingRows, setSavedUpcomingRows] = useState<ProseRow[]>(() => upcomingFromContent(content));
  const [metricRows, setMetricRows] = useState<MetricRow[]>(() => metricsFromContent(content));
  const [savedMetricRows, setSavedMetricRows] = useState<MetricRow[]>(() => metricsFromContent(content));
  const [metricCategories, setMetricCategories] = useState<string[]>(() => categoriesFromContent(content));
  const [savedMetricCategories, setSavedMetricCategories] = useState<string[]>(() => categoriesFromContent(content));
  const [closingNote, setClosingNote] = useState("");

  const inputClass = "rounded-md border bg-background px-2 py-1.5 text-xs";
  const labelClass = "grid gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

  useEffect(() => {
    setTitleClient(clientName);
    setMeetingDate(initialMeetingDate);
    setAgendaText(content?.agenda.join("\n") ?? "");
    const rows = followUpsFromContent(content);
    setFollowUpRows(rows);
    setSavedFollowUpRows(rows);
    const pRows = prioritiesFromContent(content);
    setPriorityRows(pRows);
    setSavedPriorityRows(pRows);
    const uRows = upcomingFromContent(content);
    setUpcomingRows(uRows);
    setSavedUpcomingRows(uRows);
    const mRows = metricsFromContent(content);
    setMetricRows(mRows);
    setSavedMetricRows(mRows);
    const cats = categoriesFromContent(content);
    setMetricCategories(cats);
    setSavedMetricCategories(cats);
    setClosingNote("");
  }, [section, resetToken, clientName, content, initialMeetingDate]);

  const collectOps = useCallback((): SlideEditOp[] => {
    if (section === "title") {
      const ops: SlideEditOp[] = [];
      if (titleClient.trim() && titleClient.trim() !== clientName) {
        ops.push({ type: "set_client_name", value: titleClient.trim() });
      }
      if (meetingDate && meetingDate !== initialMeetingDate) ops.push({ type: "set_meeting_date", date: meetingDate });
      return ops;
    }
    if (section === "agenda") {
      const savedAgenda = content?.agenda.join("\n") ?? "";
      if (agendaText.trim() === savedAgenda.trim()) return [];
      // An empty agenda is a valid save: the server resets to the defaults.
      return [{ type: "set_agenda", detail: agendaText }];
    }
    if (section === "followUps") {
      return buildFollowUpOps(savedFollowUpRows, followUpRows);
    }
    if (section === "priorities") {
      return buildProseOps(savedPriorityRows, priorityRows, "add_priority", "remove_priority");
    }
    if (section === "dashboard") {
      const ops = buildMetricOps(savedMetricRows, metricRows);
      // Persist category (dashboard group) additions/removals — without these
      // ops an added empty category vanished on save and a removed category
      // came back from the stored layout.
      for (const cat of metricCategories) {
        if (STANDARD_CATEGORIES.includes(cat) || savedMetricCategories.includes(cat)) continue;
        ops.push({ type: "add_dashboard_group", title: cat });
      }
      for (const cat of savedMetricCategories) {
        if (STANDARD_CATEGORIES.includes(cat) || metricCategories.includes(cat)) continue;
        ops.push({ type: "remove_dashboard_group", group: cat });
      }
      return ops;
    }
    if (section === "whatsNext") {
      return buildProseOps(savedUpcomingRows, upcomingRows, "add_upcoming", "remove_upcoming");
    }
    if (section === "questions" && closingNote.trim()) {
      return [{ type: "set_footer", value: closingNote.trim() }];
    }
    return [];
  }, [
    section,
    titleClient,
    clientName,
    meetingDate,
    initialMeetingDate,
    agendaText,
    content?.agenda,
    followUpRows,
    savedFollowUpRows,
    priorityRows,
    savedPriorityRows,
    upcomingRows,
    savedUpcomingRows,
    metricRows,
    savedMetricRows,
    metricCategories,
    savedMetricCategories,
    closingNote,
  ]);

  useEffect(() => {
    registerCollector(collectOps);
  }, [registerCollector, collectOps]);

  useEffect(() => {
    if (section === "followUps") {
      onDirtyChange(!followUpRowsEqual(savedFollowUpRows, followUpRows));
      return;
    }
    if (section === "title") {
      onDirtyChange(
        (titleClient.trim() !== clientName && !!titleClient.trim()) || meetingDate !== initialMeetingDate,
      );
      return;
    }
    if (section === "agenda") {
      onDirtyChange(agendaText.trim() !== (content?.agenda.join("\n") ?? ""));
      return;
    }
    if (section === "priorities") {
      onDirtyChange(!proseRowsEqual(savedPriorityRows, priorityRows));
      return;
    }
    if (section === "dashboard") {
      onDirtyChange(
        !metricRowsEqual(savedMetricRows, metricRows) || !stringSetsEqual(savedMetricCategories, metricCategories),
      );
      return;
    }
    if (section === "whatsNext") {
      onDirtyChange(!proseRowsEqual(savedUpcomingRows, upcomingRows));
      return;
    }
    if (section === "questions") {
      onDirtyChange(!!closingNote.trim());
      return;
    }
    onDirtyChange(false);
  }, [
    section,
    followUpRows,
    savedFollowUpRows,
    titleClient,
    clientName,
    meetingDate,
    initialMeetingDate,
    agendaText,
    content?.agenda,
    priorityRows,
    savedPriorityRows,
    upcomingRows,
    savedUpcomingRows,
    metricRows,
    savedMetricRows,
    metricCategories,
    savedMetricCategories,
    closingNote,
    onDirtyChange,
  ]);

  if (section === "title") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Client name
          <input className={inputClass} value={titleClient} onChange={(e) => setTitleClient(e.target.value)} />
        </label>
        <label className={labelClass}>
          Meeting date
          <input className={inputClass} type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
        </label>
      </div>
    );
  }

  if (section === "agenda") {
    return (
      <label className={labelClass}>
        Agenda sections
        <textarea
          className={`${inputClass} min-h-28 resize-y normal-case tracking-normal text-foreground`}
          value={agendaText}
          onChange={(e) => setAgendaText(e.target.value)}
          placeholder="One agenda section per line"
        />
      </label>
    );
  }

  if (section === "followUps") {
    return (
      <FollowUpsTable
        rows={followUpRows}
        locale={locale}
        onChange={setFollowUpRows}
        onAdd={() =>
          setFollowUpRows((rows) => [
            ...rows,
            { id: newRowId(), agreedAction: "", status: "Open", owner: "", dueDate: getStrings(locale).toConfirm },
          ])
        }
        onRemove={(id) => setFollowUpRows((rows) => rows.filter((r) => r.id !== id))}
      />
    );
  }

  if (section === "priorities") {
    return (
      <ProseList
        rows={priorityRows}
        locale={locale}
        titleLabel={locale === "fr" ? "Priorité" : "Priority"}
        bodyLabel={locale === "fr" ? "Explication" : "Client-ready explanation"}
        bodyPlaceholder={getStrings(locale).toConfirm}
        addLabel={locale === "fr" ? "+ Ajouter une priorité" : "+ Add priority"}
        emptyText={locale === "fr" ? "Aucune priorité — ajoutez-en une ci-dessous." : "No priorities yet — add one below."}
        onChange={setPriorityRows}
        onAdd={() => setPriorityRows((rows) => [...rows, { id: newRowId(), title: "", body: "" }])}
        onRemove={(id) => setPriorityRows((rows) => rows.filter((r) => r.id !== id))}
      />
    );
  }

  if (section === "dashboard") {
    return (
      <MetricList
        rows={metricRows}
        locale={locale}
        categories={metricCategories}
        onChange={setMetricRows}
        onAdd={() =>
          setMetricRows((rows) => [
            ...rows,
            { id: newRowId(), group: metricCategories[0] ?? "Operational", label: "", value: "" },
          ])
        }
        onRemove={(id) => setMetricRows((rows) => rows.filter((r) => r.id !== id))}
        onAddCategory={(name) => {
          const n = name.trim();
          if (!n) return;
          setMetricCategories((cats) => (cats.some((c) => c.toLowerCase() === n.toLowerCase()) ? cats : [...cats, n]));
        }}
        onRemoveCategory={(name) => {
          if (STANDARD_CATEGORIES.includes(name)) return;
          setMetricCategories((cats) => cats.filter((c) => c !== name));
          setMetricRows((rows) => rows.filter((r) => r.group !== name));
        }}
      />
    );
  }

  if (section === "whatsNext") {
    return (
      <ProseList
        rows={upcomingRows}
        locale={locale}
        titleLabel={locale === "fr" ? "Élément à venir" : "Upcoming item"}
        bodyLabel={locale === "fr" ? "Détail / échéancier" : "Detail / timing"}
        bodyPlaceholder={getStrings(locale).toConfirm}
        addLabel={locale === "fr" ? "+ Ajouter un élément" : "+ Add item"}
        emptyText={locale === "fr" ? "Aucun élément — ajoutez-en un ci-dessous." : "No items yet — add one below."}
        onChange={setUpcomingRows}
        onAdd={() => setUpcomingRows((rows) => [...rows, { id: newRowId(), title: "", body: "" }])}
        onRemove={(id) => setUpcomingRows((rows) => rows.filter((r) => r.id !== id))}
      />
    );
  }

  return (
    <label className={labelClass}>
      Closing note
      <input className={inputClass} value={closingNote} onChange={(e) => setClosingNote(e.target.value)} placeholder="Optional footer note" />
    </label>
  );
}

function SlideEditorPanel({
  progress,
  locale,
  busy,
  sectionBusy,
  content,
  clientName,
  initialMeetingDate,
  formResult,
  activeRailKey,
  formCardCollapsed,
  onToggleFormCard,
  onSave,
  onComplete,
  onReopen,
  onSuggestionClick,
  onDirtyStateChange,
  compact = false,
}: {
  progress: EditorProgress;
  locale: Locale;
  busy: boolean;
  sectionBusy: boolean;
  content: SlideContent | null;
  clientName: string;
  initialMeetingDate: string;
  formResult: string | null;
  activeRailKey: RailKey;
  formCardCollapsed: boolean;
  onToggleFormCard: () => void;
  onSave: (ops: SlideEditOp[]) => void;
  onComplete: () => void;
  onReopen: () => void;
  onSuggestionClick: (text: string) => void;
  /** Lets the parent know the form has unsaved edits (guards background refreshes). */
  onDirtyStateChange?: (dirty: boolean) => void;
  compact?: boolean;
}) {
  const s = getStrings(locale);
  const section = progress.currentSection;
  const isCustom = isCustomRailKey(activeRailKey);
  const customSlide = isCustom
    ? content?.customSlides?.find((c) => c.id === activeRailKey.slice(7))
    : undefined;
  const guidance = getSectionGuidance(section, content, progress, locale);
  const sectionIndex = GUIDED_SECTIONS.indexOf(section) + 1;
  const totalSlides = GUIDED_SECTIONS.length;
  const status = getSlideStatus(section, progress);
  const confirmed = status === "complete";
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [customBody, setCustomBody] = useState(customSlide?.body ?? "");
  const collectOpsRef = useRef<() => SlideEditOp[]>(() => []);

  useEffect(() => {
    setCustomBody(customSlide?.body ?? "");
  }, [customSlide?.id, customSlide?.body]);

  const registerCollector = useCallback((fn: () => SlideEditOp[]) => {
    collectOpsRef.current = fn;
  }, []);

  useEffect(() => {
    setHasUnsaved(false);
  }, [section, activeRailKey]);

  useEffect(() => {
    onDirtyStateChange?.(hasUnsaved);
  }, [hasUnsaved, onDirtyStateChange]);

  const statusLabel =
    status === "complete"
      ? s.editor.slideStatus.complete
      : status === "in_progress"
        ? s.editor.slideStatus.inProgress
        : s.editor.slideStatus.needsReview;

  const statusClass =
    status === "complete"
      ? "bg-gdi-green/15 text-gdi-green"
      : status === "in_progress"
        ? "bg-primary/10 text-primary"
        : "bg-amber-100 text-amber-800";

  const displayGuidance = isCustom
    ? {
        intro: `**${customSlide?.title ?? "Custom slide"}**\n\n${locale === "fr" ? "Diapositive personnalisée. Modifiez le contenu ci-dessous ou décrivez les changements dans le clavardage." : "Custom slide. Edit the content below or describe changes in chat."}`,
        missingFields: [] as string[],
        suggestions: [
          locale === "fr" ? "Raccourcir le texte de cette diapositive" : "Make this slide shorter",
          locale === "fr" ? "Déplacer cette diapositive après le tableau de bord" : "Move this slide after the dashboard",
        ],
      }
    : guidance;

  return (
    <div className="space-y-3">
      {!compact && <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-3">
        <p className="whitespace-pre-wrap text-xs text-foreground">{displayGuidance.intro}</p>
        {displayGuidance.missingFields.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {displayGuidance.missingFields.map((field) => (
              <button
                key={field}
                type="button"
                onClick={() => onSuggestionClick(field)}
                className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
              >
                {field}
              </button>
            ))}
          </div>
        )}
        {displayGuidance.suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {displayGuidance.suggestions.slice(0, 3).map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => onSuggestionClick(chip)}
                className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>}

      <button
        type="button"
        onClick={onToggleFormCard}
        className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-left text-xs font-medium hover:bg-accent/50"
      >
        <span>
          {isCustom
            ? customSlide?.title ?? (locale === "fr" ? "Diapositive personnalisée" : "Custom slide")
            : s.editor.formTitles[section]}
        </span>
        <span className="text-muted-foreground">{formCardCollapsed ? "+" : "−"}</span>
      </button>

      {!formCardCollapsed && (
        <div className={`${compact ? "rounded-lg border bg-background p-3" : "rounded-lg border-2 border-border bg-card p-4 shadow-sm"} resize-y overflow-auto`}>
          {!isCustom && (
            <>
              {!compact && <div className="mb-4">
                <p className="text-xs text-muted-foreground">{s.editor.editingSlide(sectionIndex, totalSlides)}</p>
                <h3 className="mt-0.5 text-sm font-semibold text-foreground">{s.editor.slideTitles[section]}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Status:{" "}
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                    {statusLabel}
                  </span>
                </p>
                {hasUnsaved && (
                  <p className="mt-2 text-[11px] font-medium text-amber-700">{s.editor.unsavedChanges}</p>
                )}
              </div>}
              <SlideFormContent
                section={section}
                locale={locale}
                content={content}
                clientName={clientName}
                initialMeetingDate={initialMeetingDate}
                resetToken={resetToken}
                onDirtyChange={setHasUnsaved}
                registerCollector={registerCollector}
              />
            </>
          )}
          {isCustom && customSlide && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {locale === "fr" ? "Type" : "Kind"}: {customSlide.kind}
              </p>
              <label className="grid gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {locale === "fr" ? "Contenu" : "Content"}
                <textarea
                  className="min-h-28 resize-y rounded-md border bg-background px-2 py-1.5 text-xs normal-case tracking-normal text-foreground"
                  value={customBody}
                  onChange={(e) => {
                    setCustomBody(e.target.value);
                    setHasUnsaved(e.target.value !== (customSlide.body ?? ""));
                  }}
                  placeholder={
                    customSlide.kind === "table"
                      ? "Header A | Header B\nRow 1 col 1 | Row 1 col 2"
                      : "Item title: detail\nAnother item"
                  }
                />
              </label>
            </div>
          )}

          {formResult && <p className="mt-3 text-xs text-muted-foreground">{formResult}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
            <button
              type="button"
              disabled={busy || !hasUnsaved}
              onClick={() => {
                if (isCustom && customSlide) {
                  onSave([
                    {
                      type: "edit_slide",
                      slideId: customSlide.id,
                      body: customBody,
                    },
                  ]);
                  setHasUnsaved(false);
                } else {
                  onSave(collectOpsRef.current());
                }
              }}
              className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {s.editor.saveSlideChanges}
            </button>
            {!isCustom && (
              <>
                {confirmed ? (
                  <button
                    type="button"
                    onClick={onReopen}
                    disabled={sectionBusy || busy}
                    className="rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    {s.editor.reopenSlideEditing}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onComplete}
                    disabled={busy || hasUnsaved}
                    className="rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    {s.editor.markSlideComplete}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setResetToken((t) => t + 1);
                setCustomBody(customSlide?.body ?? "");
                setHasUnsaved(false);
              }}
              disabled={!hasUnsaved}
              className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {s.editor.resetChanges}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SlideOrderPanel({
  locale,
  content,
  busy,
  onClose,
  onSave,
}: {
  locale: Locale;
  content: SlideContent;
  busy?: boolean;
  onClose: () => void;
  onSave: (patches: DeckPatch[]) => Promise<void>;
}) {
  const s = getStrings(locale);
  const [items, setItems] = useState<ReorderItem[]>(() => buildReorderItems(content));
  const [saving, setSaving] = useState(false);

  const labelFor = (item: ReorderItem) => {
    if (item.kind === "custom") {
      return content.customSlides?.find((slide) => slide.id === item.slideId)?.title ?? item.slideId;
    }
    return s.editor.sections[item.section];
  };

  async function saveOrder() {
    const patches = computeReorderPatches(content, items);
    if (!patches.length) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(patches);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="slide-order-title"
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border bg-background shadow-lg"
      >
        <div className="border-b px-4 py-3">
          <h2 id="slide-order-title" className="text-sm font-semibold">
            {locale === "fr" ? "Réorganiser les diapositives" : "Change slide order"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {locale === "fr"
              ? "Utilisez les flèches pour déplacer les diapositives. La page titre et la page de clôture restent fixes."
              : "Use the arrows to move slides. The title and closing slides stay fixed."}
          </p>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {items.map((item, index) => {
            const pinned = isPinnedReorderItem(item);
            const canMoveUp = !pinned && index > 0 && !isPinnedReorderItem(items[index - 1]);
            const canMoveDown =
              !pinned && index < items.length - 1 && !isPinnedReorderItem(items[index + 1]);
            return (
              <li
                key={item.id}
                className={`flex items-center gap-2 rounded-md border px-2 py-2 text-xs ${
                  pinned ? "border-dashed bg-muted/40 text-muted-foreground" : "bg-background"
                }`}
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {labelFor(item)}
                  {item.kind === "custom" && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({locale === "fr" ? "personnalisée" : "custom"})
                    </span>
                  )}
                </span>
                {pinned ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {locale === "fr" ? "Fixe" : "Fixed"}
                  </span>
                ) : (
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      disabled={busy || saving || !canMoveUp}
                      onClick={() => setItems((current) => moveReorderItem(current, index, -1))}
                      className="rounded border px-1.5 py-0.5 hover:bg-accent disabled:opacity-40"
                      title={locale === "fr" ? "Monter" : "Move up"}
                      aria-label={locale === "fr" ? "Monter" : "Move up"}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={busy || saving || !canMoveDown}
                      onClick={() => setItems((current) => moveReorderItem(current, index, 1))}
                      className="rounded border px-1.5 py-0.5 hover:bg-accent disabled:opacity-40"
                      title={locale === "fr" ? "Descendre" : "Move down"}
                      aria-label={locale === "fr" ? "Descendre" : "Move down"}
                    >
                      ↓
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            disabled={busy || saving}
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {locale === "fr" ? "Annuler" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={busy || saving}
            onClick={() => void saveOrder()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving
              ? locale === "fr"
                ? "Enregistrement…"
                : "Saving…"
              : locale === "fr"
                ? "Enregistrer l'ordre"
                : "Save order"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SlideRail({
  progress,
  locale,
  content,
  activeRailKey,
  onSelect,
  onDeleteSlide,
  onAddSlide,
  onChangeOrder,
  disabled,
  open,
  setOpen,
}: {
  progress: EditorProgress;
  locale: Locale;
  content: SlideContent | null;
  activeRailKey: RailKey;
  onSelect: (key: RailKey) => void;
  onDeleteSlide: (target: { section?: GuidedSection; slideId?: string; title: string }) => void;
  onAddSlide: () => void;
  onChangeOrder: () => void;
  disabled?: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const s = getStrings(locale);
  const hidden = new Set(content?.hiddenSections ?? []);
  const deckEntries = content ? resolveDeckSequence(content) : [];
  const visibleEntries = deckEntries.filter((entry) => entry.type !== "section" || !hidden.has(entry.section as GuidedSection));
  const currentIndex = visibleEntries.findIndex((entry) => {
    if (entry.type === "section") return railKeyForSection(entry.section as GuidedSection) === activeRailKey;
    return railKeyForCustom(entry.slide.id) === activeRailKey;
  });
  const currentEntry = currentIndex >= 0 ? visibleEntries[currentIndex] : visibleEntries[0];
  const currentLabel = currentEntry
    ? currentEntry.type === "section"
      ? s.editor.sections[currentEntry.section as GuidedSection]
      : currentEntry.slide.title
    : locale === "fr"
      ? "Diapositive"
      : "Slide";
  const goToEntry = (index: number) => {
    const entry = visibleEntries[index];
    if (!entry) return;
    onSelect(entry.type === "section" ? railKeyForSection(entry.section as GuidedSection) : railKeyForCustom(entry.slide.id));
  };

  return (
    <div className="mt-2 rounded-lg border bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => goToEntry(currentIndex - 1)}
          disabled={disabled || currentIndex <= 0}
          className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-[10px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
          title={locale === "fr" ? "Diapositive précédente" : "Previous slide"}
        >
          ‹ {locale === "fr" ? "Préc." : "Prev"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-[11px] font-semibold text-foreground hover:bg-background"
          aria-expanded={open}
        >
          {locale === "fr" ? "Diapositive" : "Slide"}: {currentIndex >= 0 ? currentIndex + 1 : "—"}/{visibleEntries.length || "—"} · {currentLabel}
          <span className="ml-2 text-muted-foreground">{open ? "▴" : "▾"}</span>
        </button>
        <button
          type="button"
          onClick={() => goToEntry(currentIndex + 1)}
          disabled={disabled || currentIndex < 0 || currentIndex >= visibleEntries.length - 1}
          className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-[10px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
          title={locale === "fr" ? "Diapositive suivante" : "Next slide"}
        >
          {locale === "fr" ? "Suiv." : "Next"} ›
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-1.5 border-t px-2 py-2">
          {visibleEntries.map((entry, index) => {
            if (entry.type === "section") {
              const section = entry.section as GuidedSection;
              const key = railKeyForSection(section);
              const review = getSectionReview(section, content, progress, locale);
              const confirmed = review.status === "complete";
              const ready = review.status === "ready";
              const current = activeRailKey === key;
              return (
                <div key={section} className="group relative inline-flex">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(key)}
                    title={`${locale === "fr" ? "Aller à cette diapositive" : "Jump to this slide"} — ${review.status.replace("_", " ")}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors hover:ring-1 hover:ring-primary/40 disabled:opacity-50 ${
                      current
                        ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30"
                        : confirmed
                          ? "border-gdi-green/30 bg-gdi-green/15 text-gdi-green hover:bg-gdi-green/25"
                          : ready
                            ? "border-primary/30 bg-primary/5 text-primary"
                            : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    <span
                      className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                        confirmed ? "bg-gdi-green text-white" : current ? "bg-primary text-primary-foreground" : "bg-background"
                      }`}
                    >
                      {confirmed ? "✓" : index + 1}
                    </span>
                    {s.editor.sections[section]}
                  </button>
                  {section !== "title" && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onDeleteSlide({ section, title: s.editor.sections[section] })}
                      className="ml-0.5 hidden rounded px-1 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:inline"
                      title={locale === "fr" ? "Supprimer cette diapositive" : "Delete this slide"}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            }

            const key = railKeyForCustom(entry.slide.id);
            const current = activeRailKey === key;
            return (
              <div key={entry.slide.id} className="group relative inline-flex">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(key)}
                  className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-[10px] font-medium ${
                    current ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-background text-[9px]">
                    {index + 1}
                  </span>
                  + {entry.slide.title}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onDeleteSlide({ slideId: entry.slide.id, title: entry.slide.title })}
                  className="ml-0.5 hidden rounded px-1 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:inline"
                  title={locale === "fr" ? "Supprimer cette diapositive" : "Delete this slide"}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            disabled={disabled}
            onClick={onChangeOrder}
            className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/70 disabled:opacity-50"
            title={locale === "fr" ? "Réorganiser toutes les diapositives" : "Reorder all slides"}
          >
            {locale === "fr" ? "↕ Ordre" : "↕ Change order"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onAddSlide}
            className="inline-flex items-center rounded-full border border-dashed px-2.5 py-1 text-[10px] font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            {locale === "fr" ? "+ Ajouter" : "+ Add slide"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CollaborateChat({
  qbrId,
  initialClientName,
  initialMeetingDate,
  quarterYear,
  status,
  aiEnabled,
  initialDeck,
  initialContent,
  initialOptions,
  initialUiLocale,
  initialDeckLocale,
  initialProgress,
  initialMessages,
}: {
  qbrId: string;
  initialClientName: string;
  initialMeetingDate: string;
  quarterYear: string;
  status: string;
  aiEnabled: boolean;
  initialDeck: DeckRef | null;
  initialContent: SlideContent | null;
  initialOptions: DeckOptions;
  initialUiLocale: Locale;
  initialDeckLocale: Locale;
  initialProgress: EditorProgress;
  initialMessages: ChatMessage[];
}) {
  // Site/UI language is global (set in the top header) — read straight from the
  // prop so a global toggle + router.refresh() re-renders this editor in sync.
  const uiLocale = initialUiLocale;
  const [deckLocale, setDeckLocale] = useState<Locale>(initialDeckLocale);
  const s = getStrings(uiLocale);

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [latestDeck, setLatestDeck] = useState<DeckRef | null>(initialDeck);
  const [editorProgress, setEditorProgress] = useState<EditorProgress>(initialProgress);
  const [formResult, setFormResult] = useState<string | null>(null);
  const [threadScope, setThreadScope] = useState<ThreadScope>("section");
  const [formCardCollapsed, setFormCardCollapsed] = useState(false);
  const [activeRailKey, setActiveRailKey] = useState<RailKey>(
    railKeyForSection(initialProgress.currentSection),
  );
  const [activeTab, setActiveTab] = useState<EditorTab>("editor");

  const [clientName, setClientName] = useState(initialClientName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialClientName);
  const [sectionBusy, setSectionBusy] = useState(false);
  const [changeHistory, setChangeHistory] = useState<ChangeActivity[]>([]);
  const agent = useAgentProposal(qbrId);

  const [content, setContent] = useState<SlideContent | null>(initialContent);
  const [deckOptions, setDeckOptions] = useState<DeckOptions>(initialOptions);
  const [highlightSection, setHighlightSection] = useState<SlideSection | null>(
    initialProgress.guidedMode ? initialProgress.currentSection : null,
  );
  const [scrollToken, setScrollToken] = useState(0);
  const [slideOrderOpen, setSlideOrderOpen] = useState(false);
  const [slideRailOpen, setSlideRailOpen] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(35);

  const endRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastPollRef = useRef<string>(new Date().toISOString());
  const lastChangeRefreshRef = useRef<string | null>(null);
  // Refs (not state) so the 5s polling closures always see the live values:
  // a background snapshot refresh must never wipe a form the user is editing
  // or race with a save that is currently in flight.
  const formDirtyRef = useRef(false);
  const formBusyRef = useRef(false);
  const handleFormDirtyChange = useCallback((dirty: boolean) => {
    formDirtyRef.current = dirty;
  }, []);

  const activeThreadSection = isCustomRailKey(activeRailKey)
    ? activeRailKey
    : editorProgress.currentSection;
  const sectionReview = useMemo(
    () => getSectionReview(editorProgress.currentSection, content, editorProgress, uiLocale),
    [content, editorProgress, uiLocale],
  );

  const visibleMessages = useMemo(() => {
    if (threadScope === "all") return messages;
    return messages.filter((m) => m.section === activeThreadSection);
  }, [messages, threadScope, activeThreadSection]);

  const slides = useMemo(() => {
    if (!content) return [];
    const localized = localizeSlideContentForLocale(content, deckLocale);
    return buildDeckManifest(localized, deckOptions, deckLocale);
  }, [content, deckOptions, deckLocale]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleMessages, busy, activeThreadSection, threadScope]);

  const pollMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/qbr/${qbrId}/messages?since=${encodeURIComponent(lastPollRef.current)}`);
      const data = await res.json();
      if (data.messages?.length) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id).filter(Boolean));
          const incoming = data.messages
            .filter((m: { id: string; role: string; text: string; section?: string }) => {
              if (ids.has(m.id)) return false;
              return !prev.some((existing) =>
                (!existing.id || existing.id.startsWith("local-")) &&
                existing.role === m.role &&
                existing.text === m.text &&
                (existing.section ?? undefined) === (m.section ?? undefined),
              );
            })
            .map((m: { id: string; role: string; text: string; section?: string; actorName?: string; metadataJson?: string }) => {
              let meta: Record<string, unknown> = {};
              if (m.metadataJson) {
                try {
                  meta = JSON.parse(m.metadataJson);
                } catch {
                  /* ignore */
                }
              }
              return {
                id: m.id,
                role: m.role as "user" | "assistant",
                text: m.text,
                section: m.section ?? undefined,
                actorName: m.actorName ?? undefined,
                applied: meta.applied as string[] | undefined,
                deck: meta.deck as DeckRef | undefined,
                suggestions: meta.suggestions as string[] | undefined,
              };
            });
          if (incoming.length) {
            lastPollRef.current = data.messages[data.messages.length - 1].createdAt;
          }
          return incoming.length ? [...prev, ...incoming] : prev;
        });
      }
    } catch {
      /* silent poll failure */
    }
  }, [qbrId]);

  useEffect(() => {
    const interval = setInterval(pollMessages, 5000);
    return () => clearInterval(interval);
  }, [pollMessages]);

  useEffect(() => {
    const pollChanges = async () => {
      try {
        const response = await fetch(`/api/qbr/${qbrId}/changes?take=20`);
        const data = await response.json();
        const changes = (data.changes ?? []) as ChangeActivity[];
        setChangeHistory(changes);
        const latestApplied = changes.find((change) => change.status === "applied" || change.status === "reverted");
        if (latestApplied && latestApplied.id !== lastChangeRefreshRef.current) {
          // Defer (don't consume the change id) while the user has unsaved form
          // edits or a save in flight — the refresh happens on a later poll.
          if (!formDirtyRef.current && !formBusyRef.current) {
            lastChangeRefreshRef.current = latestApplied.id;
            void refreshEditorSnapshot();
          }
        }
        const current = changes.find((change) => change.id === agent.proposal?.id);
        if (current && current.status !== "proposed") {
          agent.clearProposal();
          setFormResult(uiLocale === "fr" ? "Cette proposition a été traitée par un collaborateur." : "A collaborator resolved this proposal.");
        }
      } catch {
        /* message polling remains the fallback */
      }
    };
    void pollChanges();
    const interval = setInterval(pollChanges, 5000);
    return () => clearInterval(interval);
  }, [agent.proposal?.id, agent.clearProposal, qbrId, uiLocale]);


  async function refreshEditorSnapshot() {
    try {
      const res = await fetch(`/api/qbr/${qbrId}/collaborate`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) return;
      if (data.content) setContent(data.content as SlideContent);
      if (data.options) setDeckOptions(data.options as DeckOptions);
      if (data.deck) setLatestDeck(data.deck as DeckRef);
      if (data.editorProgress) setEditorProgress(data.editorProgress as EditorProgress);
      setScrollToken((t) => t + 1);
    } catch {
      /* polling should never interrupt editing */
    }
  }

  async function selectRail(key: RailKey) {
    setActiveTab("editor");
    setActiveRailKey(key);
    if (isCustomRailKey(key)) {
      setHighlightSection(editorProgress.currentSection as SlideSection);
      setScrollToken((t) => t + 1);
      return;
    }
    await selectSection(key);
  }

  async function selectSection(section: GuidedSection, completed?: boolean) {
    if (sectionBusy) return;
    setActiveTab("editor");
    setSectionBusy(true);
    // Optimistically move the highlight, editor state, completion chip, and preview to that slide.
    setEditorProgress((prev) => ({
      ...prev,
      currentSection: section,
      confirmedSections:
        completed === true
          ? Array.from(new Set([...prev.confirmedSections, section]))
          : completed === false
            ? prev.confirmedSections.filter((item) => item !== section)
            : prev.confirmedSections,
    }));
    setHighlightSection(section as SlideSection);
    setScrollToken((t) => t + 1);
    setActiveRailKey(railKeyForSection(section));
    try {
      const res = await fetch(`/api/qbr/${qbrId}/section`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, completed }),
      });
      const data = await res.json();
      if (res.ok) {
        // Only update progress here. The guided-mode panel already renders the
        // current section's prompt, so appending it to the chat as well would
        // stack a new "**Slide: …**" bubble every time the user jumps sections.
        if (data.editorProgress) {
          setEditorProgress(data.editorProgress);
          if (!data.content) {
            setHighlightSection(data.editorProgress.currentSection);
            setActiveRailKey(railKeyForSection(data.editorProgress.currentSection));
            setScrollToken((t) => t + 1);
          }
        }
      }
    } catch {
      /* keep optimistic highlight even if persistence fails */
    } finally {
      setSectionBusy(false);
    }
  }

  async function saveClientName() {
    const name = nameDraft.trim();
    if (!name || name === clientName) {
      setEditingName(false);
      setNameDraft(clientName);
      return;
    }
    const previous = clientName;
    setClientName(name);
    setEditingName(false);
    try {
      const res = await fetch(`/api/qbr/${qbrId}/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: name }),
      });
      if (!res.ok) {
        setClientName(previous);
        setNameDraft(previous);
      }
    } catch {
      setClientName(previous);
      setNameDraft(previous);
    }
  }

  async function changeDeckLanguage(next: Locale) {
    if (next === deckLocale || deckBusy) return;
    const previous = deckLocale;
    setDeckBusy(true);
    setDeckLocale(next);
    try {
      const res = await fetch(`/api/qbr/${qbrId}/language`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: next }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.content) setContent(data.content as SlideContent);
        if (data.options) setDeckOptions(data.options as DeckOptions);
        if (data.deck) setLatestDeck(data.deck);
        if (data.deckLanguage) setDeckLocale(data.deckLanguage);
        setScrollToken((t) => t + 1);
      } else {
        setDeckLocale(previous);
      }
    } catch {
      setDeckLocale(previous);
    } finally {
      setDeckBusy(false);
    }
  }

  async function downloadCurrentDeck() {
    if (downloadBusy) return;
    setDownloadBusy(true);
    try {
      const res = await fetch(`/api/qbr/${qbrId}/generate-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The HTML preview is deterministic from the structured QBR state.
        // Download from the same deterministic path so the PPTX matches what is
        // displayed instead of serving an older/stale DeckVersion file.
        body: JSON.stringify({ skipAi: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (data.fileUrl && data.versionNumber) {
        const nextDeck = { fileUrl: data.fileUrl as string, versionNumber: data.versionNumber as number };
        setLatestDeck(nextDeck);

        const deckRes = await fetch(nextDeck.fileUrl, { cache: "no-store" });
        if (!deckRes.ok) throw new Error(`Unable to download deck (${deckRes.status})`);

        const blob = await deckRes.blob();
        const pptxMime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        if (blob.size === 0 || (blob.type && blob.type !== pptxMime)) {
          throw new Error("Downloaded deck was not a valid PowerPoint file");
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = typeof data.fileName === "string" && data.fileName ? data.fileName : `BR_Draft_v${nextDeck.versionNumber}.pptx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Error downloading deck: ${(e as Error).message}`,
          section: activeSectionParam(),
        },
      ]);
    } finally {
      setDownloadBusy(false);
    }
  }

  async function deleteSlide(target: { section?: GuidedSection; slideId?: string; title: string }) {
    const confirmed = window.confirm(
      uiLocale === "fr"
        ? `Supprimer « ${target.title} »? Les diapositives intégrées seront masquées et leur contenu sera conservé.`
        : `Delete “${target.title}”? Built-in slides will be hidden and their content will be kept.`,
    );
    if (!confirmed) return;
    await submitOperations([
      target.slideId
        ? { type: "remove_slide", slideId: target.slideId, title: target.title }
        : { type: "remove_slide", section: target.section, title: target.title },
    ]);
  }

  function promptAddSlide() {
    const title = window.prompt(
      uiLocale === "fr" ? "Titre de la nouvelle diapositive :" : "New slide title:",
    );
    if (!title?.trim()) return;
    const after = isCustomRailKey(activeRailKey)
      ? editorProgress.currentSection
      : (activeRailKey as GuidedSection);
    void submitOperations([
      {
        type: "add_slide",
        title: title.trim(),
        kind: "prose",
        body: "",
        afterSection: after,
      },
    ]);
  }

  function activeSectionParam(): string {
    return isCustomRailKey(activeRailKey) ? activeRailKey : editorProgress.currentSection;
  }

  function applyAgentResult(data: Record<string, unknown>) {
    if (data.deck) setLatestDeck(data.deck as DeckRef);
    if (data.content) {
      setContent(data.content as SlideContent);
      if (data.options) setDeckOptions(data.options as DeckOptions);
      const changed: SlideSection[] = Array.isArray(data.changedSections) ? data.changedSections as SlideSection[] : [];
      setHighlightSection(changed.length > 0 ? changed[0] : editorProgress.currentSection);
      setScrollToken((token) => token + 1);
    }
    if (data.editorProgress) {
      setEditorProgress(data.editorProgress as EditorProgress);
    }
  }

  async function send(text: string, confirmSection?: string, requestContext: { inputSource?: "activity_chat" | "guided_answer"; guidedTask?: unknown } = { inputSource: "activity_chat" }) {
    const messageText = text.trim();
    if (!messageText || busy) return;
    setInput("");
    setMessages((m) => [
      ...m,
      {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "user",
        text: messageText,
        section: activeSectionParam(),
      },
    ]);
    setBusy(true);
    try {
      let data: Record<string, unknown>;
      if (confirmSection) {
        const res = await fetch(`/api/qbr/${qbrId}/collaborate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: messageText, confirmSection, activeSection: activeSectionParam(), ...requestContext }),
        });
        data = await res.json() as Record<string, unknown>;
        if (!res.ok) throw new Error(String(data.error ?? res.statusText));
      } else {
        data = await agent.propose(messageText, activeSectionParam(), requestContext);
      }
      applyAgentResult(data);
      setMessages((m) => [
        ...m,
        {
          id: data.messageId as string | undefined,
          role: "assistant",
          text: String(data.reply ?? ""),
          section: activeSectionParam(),
          applied: data.applied as string[] | undefined,
          deck: data.deck as DeckRef | null,
          suggestions: data.suggestions as string[] | undefined,
        },
      ]);
      lastPollRef.current = new Date().toISOString();
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function confirmCurrentSection() {
    void selectSection(editorProgress.currentSection, true);
  }

  async function acceptProposal() {
    if (busy) return;
    setBusy(true);
    try {
      const data = await agent.accept();
      applyAgentResult(data);
      setFormResult(uiLocale === "fr" ? "Modification appliquée et présentation mise à jour." : "Change applied and deck updated.");
    } catch (error) {
      setFormResult(`Error: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function rejectProposal() {
    try {
      await agent.reject();
      setFormResult(uiLocale === "fr" ? "Proposition rejetée; aucune donnée modifiée." : "Proposal rejected; no data changed.");
    } catch (error) {
      setFormResult(`Error: ${(error as Error).message}`);
    }
  }

  async function undoAgentChange() {
    if (busy) return;
    setBusy(true);
    try {
      const data = await agent.undo();
      applyAgentResult(data);
      setFormResult(uiLocale === "fr" ? "Dernière modification annulée." : "Last agent change undone.");
    } catch (error) {
      setFormResult(`Error: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitEdits({
    operations = [],
    patches = [],
  }: {
    operations?: SlideEditOp[];
    patches?: DeckPatch[];
  }) {
    if ((operations.length === 0 && patches.length === 0) || busy || formBusy) return;
    setFormBusy(true);
    formBusyRef.current = true;
    setFormResult(null);
    try {
      const res = await fetch(`/api/qbr/${qbrId}/collaborate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations, patches, activeSection: activeSectionParam() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormResult(`Error: ${data.error ?? res.statusText}`);
        return;
      }
      if (data.deck) setLatestDeck(data.deck);
      if (data.content) {
        setContent(data.content as SlideContent);
        if (data.options) setDeckOptions(data.options as DeckOptions);
      }
      const renamed = operations.find((op) => op.type === "set_client_name" && op.value?.trim());
      if (renamed?.value) {
        setClientName(renamed.value.trim());
        setNameDraft(renamed.value.trim());
      }
      const changed: SlideSection[] = Array.isArray(data.changedSections) ? data.changedSections : [];
      setHighlightSection(changed.length > 0 ? changed[0] : editorProgress.currentSection);
      setScrollToken((t) => t + 1);
      setFormResult(data.reply || "Saved.");
      lastPollRef.current = new Date().toISOString();
    } catch (e) {
      setFormResult(`Error: ${(e as Error).message}`);
    } finally {
      setFormBusy(false);
      formBusyRef.current = false;
    }
  }

  async function submitOperations(operations: SlideEditOp[]) {
    await submitEdits({ operations });
  }


  function reviewPendingProposal() {
    setActiveTab("editor");
    setSlideOrderOpen(false);

    const proposalSection = agent.proposal?.section;
    if (proposalSection && GUIDED_SECTIONS.includes(proposalSection as GuidedSection)) {
      const section = proposalSection as GuidedSection;
      setActiveRailKey(railKeyForSection(section));
      setEditorProgress((prev) => ({ ...prev, currentSection: section }));
      setHighlightSection(section as SlideSection);
      setScrollToken((token) => token + 1);
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .getElementById("pending-agent-proposal")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function reopenCurrentSection() {
    selectSection(editorProgress.currentSection, false);
  }

  function startPreviewResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = previewWidth;
    const viewportWidth = Math.max(window.innerWidth, 1);

    function onPointerMove(moveEvent: PointerEvent) {
      const deltaPercent = ((moveEvent.clientX - startX) / viewportWidth) * 100;
      setPreviewWidth(Math.min(70, Math.max(24, startWidth + deltaPercent)));
    }

    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-3">
      <aside
        className={`hidden min-w-0 flex-col rounded-lg border bg-background/95 p-2 transition-[width] lg:flex ${
          previewCollapsed ? "overflow-hidden" : ""
        }`}
        style={{ width: previewCollapsed ? "3rem" : previewExpanded ? "72%" : `${previewWidth}%` }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          {!previewCollapsed && (
            <>
              <h2 className="truncate text-sm font-semibold">{s.editor.livePreview}</h2>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {slides.length > 0 ? s.editor.slides(slides.length) : "—"}
              </span>
              {latestDeck && (
                <button
                  type="button"
                  onClick={downloadCurrentDeck}
                  disabled={downloadBusy}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
                  title={`${s.editor.downloadLatestDeck} — ${s.editor.latestDeckVersion(latestDeck.versionNumber)}`}
                >
                  {downloadBusy ? s.editor.revising : `⬇ v${latestDeck.versionNumber}`}
                </button>
              )}
            </>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setPreviewExpanded((value) => !value)}
              className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              title={previewExpanded ? (uiLocale === "fr" ? "Réduire l'aperçu" : "Restore preview size") : (uiLocale === "fr" ? "Agrandir l'aperçu" : "Expand preview")}
            >
              {previewExpanded ? "↙" : "↗"}
            </button>
            <button
              type="button"
              onClick={() => setPreviewCollapsed((value) => !value)}
              className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              title={previewCollapsed ? (uiLocale === "fr" ? "Afficher l'aperçu" : "Show preview") : (uiLocale === "fr" ? "Masquer l'aperçu" : "Collapse preview")}
            >
              {previewCollapsed ? "›" : "‹"}
            </button>
          </div>
        </div>
        {!previewCollapsed && (
          <>
            <DeckLanguageToggle
              deckLocale={deckLocale}
              uiLocale={uiLocale}
              busy={deckBusy}
              onChange={changeDeckLanguage}
            />
            <div className="min-h-0 flex-1 resize-y overflow-auto rounded-md">
              <DeckPreview
                slides={slides}
                highlightSection={highlightSection}
                scrollToken={scrollToken}
                onSelectSlide={(section) => selectSection(section)}
              />
            </div>
          </>
        )}
      </aside>

      <button
        type="button"
        onPointerDown={startPreviewResize}
        className="hidden w-2 cursor-col-resize rounded-full bg-border hover:bg-primary/40 lg:block"
        aria-label={uiLocale === "fr" ? "Redimensionner les volets" : "Resize panes"}
        title={uiLocale === "fr" ? "Glisser pour redimensionner" : "Drag to resize"}
      />

      <div className="flex min-w-0 flex-1 resize-x flex-col overflow-auto rounded-lg border bg-background p-2">
        <div className="shrink-0 border-b pb-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                {editingName ? (
                  <input
                    autoFocus
                    className="rounded-md border px-2 py-0.5 text-sm font-semibold"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={saveClientName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveClientName();
                      if (e.key === "Escape") {
                        setEditingName(false);
                        setNameDraft(clientName);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(clientName);
                      setEditingName(true);
                    }}
                    title={uiLocale === "fr" ? "Renommer le client" : "Rename client"}
                    className="group inline-flex items-center gap-1 rounded-md px-1 hover:bg-accent"
                  >
                    {clientName}
                    <span className="text-xs font-normal text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      ✎
                    </span>
                  </button>
                )}
                <span className="text-muted-foreground">{quarterYear}</span>
                <span className="text-[11px] font-normal text-muted-foreground">{status.replace(/_/g, " ")}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Link
                href={`/qbr/${qbrId}`}
                className="inline-flex items-center whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {s.editor.workspace}
              </Link>
              <EditorCapabilities locale={uiLocale} />
            </div>
          </div>
          {activeTab === "editor" && editorProgress.guidedMode && (
            <SlideRail
              progress={editorProgress}
              locale={uiLocale}
              content={content}
              activeRailKey={activeRailKey}
              onSelect={selectRail}
              onDeleteSlide={deleteSlide}
              onAddSlide={promptAddSlide}
              onChangeOrder={() => setSlideOrderOpen(true)}
              disabled={sectionBusy}
              open={slideRailOpen}
              setOpen={setSlideRailOpen}
            />
          )}
          {slideOrderOpen && content && (
            <SlideOrderPanel
              locale={uiLocale}
              content={content}
              busy={sectionBusy || formBusy}
              onClose={() => setSlideOrderOpen(false)}
              onSave={(patches) => submitEdits({ patches })}
            />
          )}
          <div className="mt-2 inline-flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("editor")}
              className={`rounded-md px-2.5 py-1 ${activeTab === "editor" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {uiLocale === "fr" ? "Éditeur" : "Slide editor"}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("activity");
                setSlideOrderOpen(false);
              }}
              className={`rounded-md px-2.5 py-1 ${activeTab === "activity" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {uiLocale === "fr" ? "Activité" : "Activity"}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-0.5">
            <div className="mb-3 mt-2 flex items-center gap-2 lg:hidden">
              <DeckLanguageToggle
                deckLocale={deckLocale}
                uiLocale={uiLocale}
                busy={deckBusy}
                onChange={changeDeckLanguage}
              />
              {latestDeck && (
                <button
                  type="button"
                  onClick={downloadCurrentDeck}
                  disabled={downloadBusy}
                  className="mb-2 inline-flex items-center whitespace-nowrap rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                >
                  {downloadBusy ? s.editor.revising : `${s.editor.downloadLatestDeck} (v${latestDeck.versionNumber})`}
                </button>
              )}
            </div>

            {!aiEnabled && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <strong>{uiLocale === "fr" ? "Mode édition de base." : "Basic editing mode."}</strong>{" "}
                {s.editor.basicMode}
              </div>
            )}

            {activeTab === "editor" && editorProgress.guidedMode && (
              isCustomRailKey(activeRailKey) ? (
                <div className="mt-2">
                  <SlideEditorPanel
                    progress={editorProgress}
                    locale={uiLocale}
                    busy={busy || formBusy}
                    sectionBusy={sectionBusy}
                    content={content}
                    clientName={clientName}
                    initialMeetingDate={initialMeetingDate}
                    formResult={formResult}
                    activeRailKey={activeRailKey}
                    formCardCollapsed={formCardCollapsed}
                    onToggleFormCard={() => setFormCardCollapsed((value) => !value)}
                    onSave={submitOperations}
                    onComplete={confirmCurrentSection}
                    onReopen={reopenCurrentSection}
                    onSuggestionClick={setInput}
                    onDirtyStateChange={handleFormDirtyChange}
                  />
                </div>
              ) : (
                <AgentTaskCard
                  review={sectionReview}
                  locale={uiLocale}
                  answer={input}
                  onAnswerChange={setInput}
                  onSubmit={() => send(input, undefined, { inputSource: "guided_answer", guidedTask: sectionReview.nextTask })}
                  onConfirmSection={confirmCurrentSection}
                  onAcceptProposal={acceptProposal}
                  onRejectProposal={rejectProposal}
                  onUndo={undoAgentChange}
                  proposal={agent.proposal}
                  stage={agent.stage}
                  busy={busy || formBusy || agent.stage !== "idle"}
                >
                  <SlideEditorPanel
                    compact
                    progress={editorProgress}
                    locale={uiLocale}
                    busy={busy || formBusy}
                    sectionBusy={sectionBusy}
                    content={content}
                    clientName={clientName}
                    initialMeetingDate={initialMeetingDate}
                    formResult={formResult}
                    activeRailKey={activeRailKey}
                    formCardCollapsed={formCardCollapsed}
                    onToggleFormCard={() => setFormCardCollapsed((value) => !value)}
                    onSave={submitOperations}
                    onComplete={confirmCurrentSection}
                    onReopen={reopenCurrentSection}
                    onSuggestionClick={setInput}
                    onDirtyStateChange={handleFormDirtyChange}
                  />
                </AgentTaskCard>
              )
            )}

            {activeTab === "activity" && (
              <div className="mt-3">
                {agent.proposal?.status === "proposed" && (
                  <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                    <p className="font-semibold text-foreground">
                      {uiLocale === "fr" ? "Une modification est prête à approuver." : "A proposed change is ready for approval."}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {uiLocale === "fr"
                        ? "Passez à l’éditeur pour examiner, appliquer ou rejeter la modification proposée."
                        : "Go back to the editor to review, apply, or reject the proposed change."}
                    </p>
                    <button
                      type="button"
                      onClick={reviewPendingProposal}
                      className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      {uiLocale === "fr" ? "Approuver les modifications" : "Approve changes"}
                    </button>
                  </div>
                )}
                {changeHistory.length > 0 && (
              <div className="border-b bg-background px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {uiLocale === "fr" ? "Modifications récentes" : "Recent changes"}
                </p>
                <ul className="mt-1 space-y-1">
                  {changeHistory.slice(0, 5).map((change) => (
                    <li key={change.id} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="truncate">{change.message || change.section || (uiLocale === "fr" ? "Modification de la présentation" : "Deck change")}</span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-medium">{change.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex min-h-[200px] flex-1 flex-col bg-muted/10">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <h3 className="text-xs font-medium text-foreground">{s.editor.askAssistant}</h3>
                <div className="flex gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setThreadScope("section")}
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      threadScope === "section" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {uiLocale === "fr" ? "Cette diapo" : "This slide"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setThreadScope("all")}
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      threadScope === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {uiLocale === "fr" ? "Tout" : "All"}
                  </button>
                </div>
              </div>

              <div ref={threadRef} className="min-h-[120px] flex-1 space-y-2 overflow-y-auto p-3">
                {visibleMessages.length === 0 && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    {uiLocale === "fr"
                      ? "Aucun message pour cette diapositive — décrivez une modification ci-dessous."
                      : "No messages for this slide yet — describe a change below."}
                  </p>
                )}
                {visibleMessages.map((m, i) => (
                  <div key={m.id ?? i}>
                    <div
                      className={`rounded-lg px-2.5 py-2 text-[11px] ${
                        m.role === "user"
                          ? "ml-6 bg-primary/10 text-foreground"
                          : "mr-6 border bg-background text-foreground"
                      }`}
                    >
                      {m.actorName && m.role === "user" && (
                        <p className="mb-0.5 text-[9px] font-semibold opacity-70">{m.actorName}</p>
                      )}
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      {m.applied && m.applied.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                          {m.applied.map((a, j) => (
                            <li key={j}>✓ {a}</li>
                          ))}
                        </ul>
                      )}
                      {m.role === "assistant" && m.suggestions && m.suggestions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {m.suggestions.map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => {
                                setInput(chip);
                                inputRef.current?.focus();
                              }}
                              className="rounded-full border bg-background px-2 py-0.5 text-[10px] hover:border-primary/40"
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="rounded-lg border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                    {s.editor.revising}
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-end gap-2 border-t bg-background p-3"
              >
                <textarea
                  ref={inputRef}
                  className="h-10 max-h-32 flex-1 resize-none rounded-md border px-3 py-2 text-xs"
                  placeholder={
                    isCustomRailKey(activeRailKey)
                      ? uiLocale === "fr"
                        ? "Modifier cette diapositive personnalisée…"
                        : "Edit this custom slide…"
                      : sectionChatPlaceholder(editorProgress.currentSection, uiLocale)
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                >
                  {s.editor.send}
                </button>
              </form>
              </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
