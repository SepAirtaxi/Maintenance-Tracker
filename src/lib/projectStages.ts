import { differenceInCalendarDays } from "date-fns";
import type { Project, ProjectCurrency, ProjectStage } from "@/types";

export type StageDef = {
  key: ProjectStage;
  // Full name — menus, tooltips.
  label: string;
  // Fits a progress-bar segment.
  short: string;
  // What the stage's target date means, worded as the thing that must have
  // happened by then. Shown next to the date input and the countdown.
  targetLabel: string | null;
};

// The pipeline, in order. `rejected` is not part of it — it's an exit that
// branches off after "Quote sent".
export const PIPELINE: StageDef[] = [
  { key: "rfq", label: "RFQ received", short: "RFQ", targetLabel: "Quote sent by" },
  { key: "quoted", label: "Quote sent", short: "Quoted", targetLabel: "Customer answer by" },
  { key: "accepted", label: "Quote accepted", short: "Accepted", targetLabel: "Work order by" },
  { key: "wo", label: "Work order created", short: "WO", targetLabel: "Engineering start by" },
  { key: "engineering", label: "Engineering", short: "Engineering", targetLabel: "Engineering done by" },
  { key: "planning", label: "Planning / procurement", short: "Planning", targetLabel: "Parts & slot ready by" },
  { key: "installation", label: "Installation", short: "Installation", targetLabel: "Installation done by" },
  { key: "completed", label: "Completed", short: "Done", targetLabel: null },
];

export const REJECTED: StageDef = {
  key: "rejected",
  label: "Quote rejected",
  short: "Rejected",
  targetLabel: null,
};

const BY_KEY = new Map<ProjectStage, StageDef>(
  [...PIPELINE, REJECTED].map((s) => [s.key, s]),
);

export function stageDef(key: ProjectStage): StageDef {
  return BY_KEY.get(key) ?? PIPELINE[0];
}

// Position in the pipeline; `rejected` sits where the customer answered.
export function stageIndex(key: ProjectStage): number {
  if (key === "rejected") return 1;
  return PIPELINE.findIndex((s) => s.key === key);
}

export function isClosed(stage: ProjectStage): boolean {
  return stage === "completed" || stage === "rejected";
}

export type ProjectFilter = "active" | "quoting" | "inwork" | "closed" | "all";

export function matchesFilter(stage: ProjectStage, f: ProjectFilter): boolean {
  switch (f) {
    case "active":
      return !isClosed(stage);
    case "quoting":
      return stage === "rfq" || stage === "quoted";
    case "inwork":
      return !isClosed(stage) && stage !== "rfq" && stage !== "quoted";
    case "closed":
      return isClosed(stage);
    case "all":
      return true;
  }
}

export type DeadlineSeverity = "red" | "yellow" | "green";

export type Deadline =
  | { kind: "closed" }
  | { kind: "none" }
  | {
      kind: "due";
      date: Date;
      // Negative = overdue by that many days.
      daysLeft: number;
      severity: DeadlineSeverity;
      label: string;
    };

// Within this many days a target turns yellow.
export const DUE_SOON_DAYS = 7;

export function getDeadline(p: Project, now = new Date()): Deadline {
  if (isClosed(p.stage)) return { kind: "closed" };
  const ts = p.stageTargets[p.stage];
  const label = stageDef(p.stage).targetLabel;
  if (!ts || !label) return { kind: "none" };
  const date = ts.toDate();
  const daysLeft = differenceInCalendarDays(date, now);
  const severity: DeadlineSeverity =
    daysLeft < 0 ? "red" : daysLeft <= DUE_SOON_DAYS ? "yellow" : "green";
  return { kind: "due", date, daysLeft, severity, label };
}

export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "Tomorrow";
  if (daysLeft > 0) return `${daysLeft} days left`;
  const over = -daysLeft;
  return `${over} day${over === 1 ? "" : "s"} overdue`;
}

export function daysInStage(p: Project, now = new Date()): number {
  return Math.max(0, differenceInCalendarDays(now, p.stageEnteredAt.toDate()));
}

export function formatMoney(amount: number, currency: ProjectCurrency): string {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Sort order for the active list: overdue first, then nearest target, then
// projects without a target (newest first). Closed projects by last change.
export function compareProjects(a: Project, b: Project): number {
  const ca = isClosed(a.stage);
  const cb = isClosed(b.stage);
  if (ca !== cb) return ca ? 1 : -1;
  if (ca && cb) return b.updatedAt.toMillis() - a.updatedAt.toMillis();
  const da = getDeadline(a);
  const db = getDeadline(b);
  const ta = da.kind === "due" ? da.date.getTime() : Infinity;
  const tb = db.kind === "due" ? db.date.getTime() : Infinity;
  if (ta !== tb) return ta - tb;
  return b.openedDate.toMillis() - a.openedDate.toMillis();
}
