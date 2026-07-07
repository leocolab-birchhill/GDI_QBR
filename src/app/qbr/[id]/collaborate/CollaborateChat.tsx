"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { SlideContent, SlideEditOp } from "@/lib/ai/schemas";
import { METRIC_GROUPS } from "@/lib/constants";
import type { DeckOptions } from "@/lib/ppt/generateQbrDeck";
import { buildDeckManifest, type SlideSection } from "@/lib/ppt/slideManifest";
import {
  GUIDED_SECTIONS,
  getStrings,
  localizeSlideContentForLocale,
  type EditorProgress,
  type GuidedSection,
  type Locale,
} from "@/lib/i18n";
import DeckPreview from "./DeckPreview";
import DeckLanguageToggle from "./DeckLanguageToggle";

interface DeckRef {
  fileUrl: string;
  versionNumber: number;
}

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  text: string;
  actorName?: string;
  applied?: string[];
  deck?: DeckRef | null;
  suggestions?: string[];
}

function EditorCapabilities({ locale }: { locale: Locale }) {
  const c = getStrings(locale).editor.capabilities;
  return (
    <details className="mt-3 rounded-md border bg-muted/30 text-xs">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-foreground hover:bg-muted/50">
        {c.title}
      </summary>
      <div className="grid gap-3 border-t px-3 py-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 font-semibold text-gdi-green">{c.can}</p>
          <ul className="space-y-1 text-muted-foreground">
            {c.canItems.map((item, i) => (
              <li key={i}>· {item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 font-semibold text-amber-800">{c.cant}</p>
          <ul className="space-y-1 text-muted-foreground">
            {c.cantItems.map((item, i) => (
              <li key={i}>· {item}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">{c.capacityNote}</p>
    </details>
  );
}

type SlideStatus = "in_progress" | "complete" | "needs_review";

interface FollowUpRow {
  id: string;
  originalAction?: string;
  agreedAction: string;
  status: string;
  owner: string;
  dueDate: string;
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
    originalAction: f.action,
    agreedAction: f.action,
    status: f.status || "Open",
    owner: f.owner || "",
    dueDate: f.dueDate || "",
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
      row.originalAction === other.originalAction
    );
  });
}

function buildFollowUpOps(saved: FollowUpRow[], draft: FollowUpRow[]): SlideEditOp[] {
  const ops: SlideEditOp[] = [];
  const draftByOrig = new Map(draft.filter((r) => r.originalAction).map((r) => [r.originalAction!, r]));

  for (const row of saved) {
    if (!row.originalAction) continue;
    if (!draftByOrig.has(row.originalAction)) {
      ops.push({ type: "remove_commitment", action: row.originalAction });
    }
  }

  for (const row of draft) {
    const action = row.agreedAction.trim();
    if (!action) continue;
    if (!row.originalAction) {
      ops.push({
        type: "add_commitment",
        action,
        status: row.status,
        owner: row.owner.trim() || undefined,
        date: isIsoDate(row.dueDate) ? row.dueDate : undefined,
      });
      continue;
    }
    const savedRow = saved.find((s) => s.originalAction === row.originalAction);
    if (!savedRow) continue;
    if (row.originalAction !== action) {
      ops.push({ type: "remove_commitment", action: row.originalAction });
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
        action: row.originalAction,
        status: row.status,
        owner: row.owner.trim() || undefined,
        date: isIsoDate(row.dueDate) ? row.dueDate : undefined,
      });
    }
  }
  return ops;
}

/** A numbered title + body row shared by the Priority Items and What's Next lists. */
interface ProseRow {
  id: string;
  /** The item's title at load time; used to target edit/remove ops. Absent = new row. */
  originalTitle?: string;
  title: string;
  body: string;
}

interface MetricRow {
  id: string;
  originalLabel?: string;
  group: string;
  label: string;
  value: string;
}

function prioritiesFromContent(content: SlideContent | null): ProseRow[] {
  return (content?.priorityItems ?? []).map((p) => ({
    id: newRowId(),
    originalTitle: p.title,
    title: p.title,
    body: p.explanation,
  }));
}

function upcomingFromContent(content: SlideContent | null): ProseRow[] {
  return (content?.whatsNext ?? []).map((u) => ({
    id: newRowId(),
    originalTitle: u.title,
    title: u.title,
    body: u.detail,
  }));
}

function metricsFromContent(content: SlideContent | null): MetricRow[] {
  if (!content) return [];
  const d = content.dashboard;
  const out: MetricRow[] = [];
  const push = (group: string, rows: { label: string; value: string }[]) => {
    for (const r of rows) out.push({ id: newRowId(), originalLabel: r.label, group, label: r.label, value: r.value });
  };
  push("Health & Safety", d.healthAndSafety);
  push("Operational", d.operational);
  push("Financial", d.financial);
  for (const g of d.customGroups ?? []) push(g.title, g.rows);
  return out;
}

/** The standard, non-removable dashboard categories (always shown on the deck). */
const STANDARD_CATEGORIES: string[] = [...METRIC_GROUPS];

/** All categories available in the editor: the standard three plus any custom ones in the deck. */
function categoriesFromContent(content: SlideContent | null): string[] {
  const fromRows = metricsFromContent(content).map((r) => r.group);
  return Array.from(new Set([...STANDARD_CATEGORIES, ...fromRows]));
}

function proseRowsEqual(a: ProseRow[], b: ProseRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.title === b[i].title && row.body === b[i].body && row.originalTitle === b[i].originalTitle);
}

function metricRowsEqual(a: MetricRow[], b: MetricRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) => row.group === b[i].group && row.label === b[i].label && row.value === b[i].value && row.originalLabel === b[i].originalLabel,
  );
}

/** Diff saved vs draft prose rows into add/remove ops (edits become remove+add). */
function buildProseOps(
  saved: ProseRow[],
  draft: ProseRow[],
  addType: "add_priority" | "add_upcoming",
  removeType: "remove_priority" | "remove_upcoming",
): SlideEditOp[] {
  const ops: SlideEditOp[] = [];
  const draftByOrig = new Set(draft.filter((r) => r.originalTitle).map((r) => r.originalTitle!));
  for (const row of saved) {
    if (row.originalTitle && !draftByOrig.has(row.originalTitle)) {
      ops.push({ type: removeType, title: row.originalTitle });
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
    if (!row.originalTitle) {
      ops.push(addOp);
      continue;
    }
    const savedRow = saved.find((s) => s.originalTitle === row.originalTitle);
    if (!savedRow) continue;
    if (savedRow.title !== title || savedRow.body !== row.body) {
      ops.push({ type: removeType, title: row.originalTitle });
      ops.push(addOp);
    }
  }
  return ops;
}

function buildMetricOps(saved: MetricRow[], draft: MetricRow[]): SlideEditOp[] {
  const ops: SlideEditOp[] = [];
  const draftByOrig = new Set(draft.filter((r) => r.originalLabel).map((r) => r.originalLabel!));
  for (const row of saved) {
    if (row.originalLabel && !draftByOrig.has(row.originalLabel)) {
      ops.push({ type: "remove_metric", label: row.originalLabel });
    }
  }
  for (const row of draft) {
    const label = row.label.trim();
    if (!label) continue;
    const group = row.group.trim() || "Operational";
    const value = row.value.trim() || undefined;
    if (!row.originalLabel) {
      ops.push({ type: "set_metric", group, label, value });
      continue;
    }
    const savedRow = saved.find((s) => s.originalLabel === row.originalLabel);
    if (!savedRow) continue;
    if (savedRow.label !== label) {
      ops.push({ type: "remove_metric", label: row.originalLabel });
      ops.push({ type: "set_metric", group, label, value });
    } else if (savedRow.group !== row.group || savedRow.value !== row.value) {
      ops.push({ type: "set_metric", group, label, value });
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
  resetToken,
  onDirtyChange,
  registerCollector,
}: {
  section: GuidedSection;
  locale: Locale;
  content: SlideContent | null;
  clientName: string;
  resetToken: number;
  onDirtyChange: (dirty: boolean) => void;
  registerCollector: (fn: () => SlideEditOp[]) => void;
}) {
  const [titleClient, setTitleClient] = useState(clientName);
  const [meetingDate, setMeetingDate] = useState("");
  const [nextMeetingDate, setNextMeetingDate] = useState("");
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
  const [closingNote, setClosingNote] = useState("");

  const inputClass = "rounded-md border bg-background px-2 py-1.5 text-xs";
  const labelClass = "grid gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

  useEffect(() => {
    setTitleClient(clientName);
    setMeetingDate("");
    setNextMeetingDate("");
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
    setMetricCategories(categoriesFromContent(content));
    setClosingNote("");
  }, [section, resetToken, clientName, content]);

  const collectOps = useCallback((): SlideEditOp[] => {
    if (section === "title") {
      const ops: SlideEditOp[] = [];
      if (titleClient.trim() && titleClient.trim() !== clientName) {
        ops.push({ type: "set_client_name", value: titleClient.trim() });
      }
      if (meetingDate) ops.push({ type: "set_meeting_date", date: meetingDate });
      if (nextMeetingDate) ops.push({ type: "set_next_meeting_date", date: nextMeetingDate });
      return ops;
    }
    if (section === "agenda") {
      if (!agendaText.trim()) return [];
      return [{ type: "set_agenda", detail: agendaText }];
    }
    if (section === "followUps") {
      return buildFollowUpOps(savedFollowUpRows, followUpRows);
    }
    if (section === "priorities") {
      return buildProseOps(savedPriorityRows, priorityRows, "add_priority", "remove_priority");
    }
    if (section === "dashboard") {
      return buildMetricOps(savedMetricRows, metricRows);
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
    nextMeetingDate,
    agendaText,
    followUpRows,
    savedFollowUpRows,
    priorityRows,
    savedPriorityRows,
    upcomingRows,
    savedUpcomingRows,
    metricRows,
    savedMetricRows,
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
        (titleClient.trim() !== clientName && !!titleClient.trim()) || !!meetingDate || !!nextMeetingDate,
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
      onDirtyChange(!metricRowsEqual(savedMetricRows, metricRows));
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
    nextMeetingDate,
    agendaText,
    content?.agenda,
    priorityRows,
    savedPriorityRows,
    upcomingRows,
    savedUpcomingRows,
    metricRows,
    savedMetricRows,
    closingNote,
    onDirtyChange,
  ]);

  if (section === "title") {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Client name
          <input className={inputClass} value={titleClient} onChange={(e) => setTitleClient(e.target.value)} />
        </label>
        <label className={labelClass}>
          Meeting date
          <input className={inputClass} type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
        </label>
        <label className={labelClass}>
          Next QBR date
          <input className={inputClass} type="date" value={nextMeetingDate} onChange={(e) => setNextMeetingDate(e.target.value)} />
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
  formResult,
  onSave,
  onComplete,
  onReopen,
}: {
  progress: EditorProgress;
  locale: Locale;
  busy: boolean;
  sectionBusy: boolean;
  content: SlideContent | null;
  clientName: string;
  formResult: string | null;
  onSave: (ops: SlideEditOp[]) => void;
  onComplete: () => void;
  onReopen: () => void;
}) {
  const s = getStrings(locale);
  const section = progress.currentSection;
  const sectionIndex = GUIDED_SECTIONS.indexOf(section) + 1;
  const totalSlides = GUIDED_SECTIONS.length;
  const status = getSlideStatus(section, progress);
  const confirmed = status === "complete";
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const collectOpsRef = useRef<() => SlideEditOp[]>(() => []);

  const registerCollector = useCallback((fn: () => SlideEditOp[]) => {
    collectOpsRef.current = fn;
  }, []);

  useEffect(() => {
    setHasUnsaved(false);
  }, [section]);

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

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">{s.editor.editingSlide(sectionIndex, totalSlides)}</p>
        <h2 className="mt-0.5 text-base font-semibold text-foreground">{s.editor.slideTitles[section]}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Status:{" "}
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
            {statusLabel}
          </span>
        </p>
      </div>

      <div className="rounded-lg border-2 border-border bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">{s.editor.formTitles[section]}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{s.editor.formHelpers[section]}</p>
          {hasUnsaved && (
            <p className="mt-2 text-[11px] font-medium text-amber-700">{s.editor.unsavedChanges}</p>
          )}
        </div>

        <SlideFormContent
          section={section}
          locale={locale}
          content={content}
          clientName={clientName}
          resetToken={resetToken}
          onDirtyChange={setHasUnsaved}
          registerCollector={registerCollector}
        />

        {formResult && (
          <p className="mt-3 text-xs text-muted-foreground">{formResult}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
          <button
            type="button"
            disabled={busy || !hasUnsaved}
            onClick={() => onSave(collectOpsRef.current())}
            className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {s.editor.saveSlideChanges}
          </button>
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
          <button
            type="button"
            onClick={() => {
              setResetToken((t) => t + 1);
              setHasUnsaved(false);
            }}
            disabled={!hasUnsaved}
            className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {s.editor.resetChanges}
          </button>
        </div>
      </div>
    </div>
  );
}

function SlideMap({
  progress,
  locale,
  onSelect,
  disabled,
}: {
  progress: EditorProgress;
  locale: Locale;
  onSelect: (section: GuidedSection) => void;
  disabled?: boolean;
}) {
  const s = getStrings(locale);
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {GUIDED_SECTIONS.map((section, index) => {
        const confirmed = progress.confirmedSections.includes(section);
        const current = progress.currentSection === section;
        return (
          <button
            key={section}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(section)}
            title={locale === "fr" ? "Revenir a cette diapositive" : "Jump to this slide"}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors hover:ring-1 hover:ring-primary/40 disabled:opacity-50 ${
              current
                ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30"
                : confirmed
                  ? "border-gdi-green/30 bg-gdi-green/15 text-gdi-green hover:bg-gdi-green/25"
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
        );
      })}
    </div>
  );
}

export default function CollaborateChat({
  qbrId,
  initialClientName,
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
  const [latestDeck, setLatestDeck] = useState<DeckRef | null>(initialDeck);
  const [editorProgress, setEditorProgress] = useState<EditorProgress>(initialProgress);
  const [formResult, setFormResult] = useState<string | null>(null);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);

  const [clientName, setClientName] = useState(initialClientName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialClientName);
  const [sectionBusy, setSectionBusy] = useState(false);

  const [content, setContent] = useState<SlideContent | null>(initialContent);
  const [deckOptions, setDeckOptions] = useState<DeckOptions>(initialOptions);
  const [highlightSection, setHighlightSection] = useState<SlideSection | null>(
    initialProgress.guidedMode ? initialProgress.currentSection : null,
  );
  const [scrollToken, setScrollToken] = useState(0);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastPollRef = useRef<string>(new Date().toISOString());

  const slides = useMemo(() => {
    if (!content) return [];
    const localized = localizeSlideContentForLocale(content, deckLocale);
    return buildDeckManifest(localized, deckOptions, deckLocale);
  }, [content, deckOptions, deckLocale]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const pollMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/qbr/${qbrId}/messages?since=${encodeURIComponent(lastPollRef.current)}`);
      const data = await res.json();
      if (data.messages?.length) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id).filter(Boolean));
          const incoming = data.messages
            .filter((m: { id: string }) => !ids.has(m.id))
            .map((m: { id: string; role: string; text: string; actorName?: string; metadataJson?: string }) => {
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

  async function selectSection(section: GuidedSection, completed?: boolean) {
    if (sectionBusy) return;
    setSectionBusy(true);
    // Optimistically move the highlight + scroll the preview to that slide.
    setHighlightSection(section as SlideSection);
    setScrollToken((t) => t + 1);
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

  async function send(text: string, confirmSection?: string) {
    const messageText = text.trim();
    if (!messageText || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: messageText }]);
    setBusy(true);
    try {
      const res = await fetch(`/api/qbr/${qbrId}/collaborate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          confirmSection,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", text: `Error: ${data.error ?? res.statusText}` }]);
      } else {
        if (data.deck) setLatestDeck(data.deck);
        if (data.content) {
          setContent(data.content as SlideContent);
          if (data.options) setDeckOptions(data.options as DeckOptions);
          const changed: SlideSection[] = Array.isArray(data.changedSections) ? data.changedSections : [];
          setHighlightSection(changed.length > 0 ? changed[0] : editorProgress.currentSection);
          setScrollToken((t) => t + 1);
        }
        if (data.editorProgress) {
          setEditorProgress(data.editorProgress);
          if (!data.content) {
            setHighlightSection(data.editorProgress.currentSection);
            setScrollToken((t) => t + 1);
          }
        }
        setMessages((m) => [
          ...m,
          {
            id: data.messageId,
            role: "assistant",
            text: data.reply,
            applied: data.applied,
            deck: data.deck,
            suggestions: data.suggestions,
          },
        ]);
        lastPollRef.current = new Date().toISOString();
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function confirmCurrentSection() {
    send(s.editor.confirm, editorProgress.currentSection);
  }

  async function submitOperations(operations: SlideEditOp[]) {
    if (operations.length === 0 || busy || formBusy) return;
    setFormBusy(true);
    setFormResult(null);
    try {
      const res = await fetch(`/api/qbr/${qbrId}/collaborate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations }),
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
    }
  }

  function reopenCurrentSection() {
    selectSection(editorProgress.currentSection, false);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <aside className="hidden w-[44%] min-w-[360px] flex-col lg:flex">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{s.editor.livePreview}</h2>
          <span className="text-xs text-muted-foreground">
            {slides.length > 0 ? s.editor.slides(slides.length) : "—"}
          </span>
        </div>
        <DeckLanguageToggle
          deckLocale={deckLocale}
          uiLocale={uiLocale}
          busy={deckBusy}
          onChange={changeDeckLanguage}
        />
        <div className="min-h-0 flex-1">
          <DeckPreview
            slides={slides}
            highlightSection={highlightSection}
            scrollToken={scrollToken}
            onSelectSlide={(section) => selectSection(section)}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-x-2 text-xl font-bold">
                <span className="text-muted-foreground">{s.editor.deckEditor} —</span>
                {editingName ? (
                  <input
                    autoFocus
                    className="rounded-md border px-2 py-0.5 text-xl font-bold"
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
              </h1>
              <p className="text-xs text-muted-foreground">{status.replace(/_/g, " ")}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {latestDeck && (
                <>
                  <span className="text-[11px] text-muted-foreground">
                    {s.editor.latestDeckVersion(latestDeck.versionNumber)}
                  </span>
                  <a
                    href={latestDeck.fileUrl}
                    className="inline-flex items-center whitespace-nowrap rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    {s.editor.downloadLatestDeck}
                  </a>
                </>
              )}
              <Link
                href={`/qbr/${qbrId}`}
                className="inline-flex items-center whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {s.editor.workspace}
              </Link>
            </div>
          </div>
          {editorProgress.guidedMode && (
            <SlideMap
              progress={editorProgress}
              locale={uiLocale}
              onSelect={selectSection}
              disabled={sectionBusy}
            />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-3 mt-2 lg:hidden">
            <DeckLanguageToggle
              deckLocale={deckLocale}
              uiLocale={uiLocale}
              busy={deckBusy}
              onChange={changeDeckLanguage}
            />
          </div>

          {!aiEnabled && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>{uiLocale === "fr" ? "Mode édition de base." : "Basic editing mode."}</strong>{" "}
              {s.editor.basicMode}
            </div>
          )}

          {editorProgress.guidedMode && (
            <SlideEditorPanel
              progress={editorProgress}
              locale={uiLocale}
              busy={busy || formBusy}
              sectionBusy={sectionBusy}
              content={content}
              clientName={clientName}
              formResult={formResult}
              onSave={submitOperations}
              onComplete={confirmCurrentSection}
              onReopen={reopenCurrentSection}
            />
          )}

          <div className="mt-6 rounded-md border border-dashed bg-muted/10 p-3">
            <h3 className="text-xs font-medium text-muted-foreground">{s.editor.askAssistant}</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">{s.editor.askAssistantHelper}</p>

            {messages.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setChatHistoryOpen((v) => !v)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {s.editor.chatHistory} ({messages.length}) {chatHistoryOpen ? "−" : "+"}
                </button>
                {chatHistoryOpen && (
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border bg-background/50 p-2">
                    {messages.map((m, i) => (
                      <div
                        key={m.id ?? i}
                        className={`rounded-lg px-2.5 py-2 text-[11px] ${
                          m.role === "user"
                            ? "ml-4 bg-primary/10 text-foreground"
                            : "mr-4 border bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        {m.actorName && m.role === "user" && (
                          <p className="mb-0.5 text-[9px] font-semibold opacity-70">{m.actorName}</p>
                        )}
                        <p className="whitespace-pre-wrap">{m.text}</p>
                        {m.applied && m.applied.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-[10px] opacity-80">
                            {m.applied.map((a, j) => (
                              <li key={j}>✓ {a}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                    {busy && (
                      <div className="rounded-lg border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                        {s.editor.revising}
                      </div>
                    )}
                    <div ref={endRef} />
                  </div>
                )}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="mt-3 flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                className="h-10 max-h-32 flex-1 resize-none rounded-md border px-3 py-2 text-xs"
                placeholder={s.editor.slideChatPlaceholder}
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

          <EditorCapabilities locale={uiLocale} />
        </div>
      </div>
    </div>
  );
}
