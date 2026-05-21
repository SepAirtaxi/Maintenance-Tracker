import { AlertTriangle, Check, Clock, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import {
  DEFERRAL_REVIEW_DAYS,
  daysSinceDeferred,
  getDefectPlanStatus,
  getDeferralStatus,
  type DeferralStatus,
  type PlanStatus,
} from "@/lib/eventStatus";
import WorkOrderCell from "@/components/overview/WorkOrderCell";
import EstimatePill from "@/components/overview/EstimatePill";
import { EVENTS_GRID_COLS } from "@/components/overview/EventRow";
import { updateDefect } from "@/services/defects";
import type { Defect } from "@/types";

// Share the events grid template so the Status column lines up vertically
// across event and defect rows on the same aircraft card.
const DEFECTS_GRID_COLS = EVENTS_GRID_COLS;

const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  unplanned: "No action",
  planned: "WO created",
  booked: "WO + booked",
};

const PLAN_STATUS_CLASS: Record<PlanStatus, string> = {
  unplanned: "border-sev-red-edge/40 bg-sev-red-bg/70 text-sev-red-fg",
  planned: "border-sev-yellow-edge/50 bg-sev-yellow-bg/60 text-sev-yellow-fg",
  booked: "border-sev-green-edge/50 bg-sev-green-bg/70 text-sev-green-fg",
};

type Props = {
  defects: Defect[];
  bookedDefectIds: ReadonlySet<string>;
  readOnly?: boolean;
  onEdit: (defect: Defect) => void;
  onDelete: (defect: Defect) => void;
  onResolve: (defect: Defect) => void;
  onDefer: (defect: Defect) => void;
  onViewDeferralHistory: (defect: Defect) => void;
  onEstimate: (defect: Defect) => void;
};

function DeferralPill({
  status,
  defect,
  onClick,
}: {
  status: DeferralStatus;
  defect: Defect;
  onClick: () => void;
}) {
  if (status === "none") return null;
  const elapsed = daysSinceDeferred(defect) ?? 0;
  const overdue = status === "overdue";
  const reasonHint = defect.deferralReason
    ? ` — ${defect.deferralReason}`
    : "";
  const title = overdue
    ? `Deferral OVERDUE: ${elapsed}d elapsed (limit ${DEFERRAL_REVIEW_DAYS}d). CAMO follow-up required.${reasonHint}`
    : `Deferred ${elapsed}d ago (review at ${DEFERRAL_REVIEW_DAYS}d).${reasonHint}`;
  const labelText = overdue
    ? `OVERDUE ${elapsed}d`
    : `Deferred ${elapsed}/${DEFERRAL_REVIEW_DAYS}d`;
  const className = cn(
    "shrink-0 inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-spec",
    overdue
      ? "border-sev-red-edge bg-sev-red-bg text-sev-red-fg animate-pulse"
      : "border-sev-yellow-edge/70 bg-sev-yellow-bg text-sev-yellow-fg",
  );

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${title} · click to see deferral history`}
      className={cn(className, "transition-colors hover:brightness-95")}
    >
      {overdue ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {labelText}
    </button>
  );
}

export default function DefectsList({
  defects,
  bookedDefectIds,
  readOnly = false,
  onEdit,
  onDelete,
  onResolve,
  onDefer,
  onViewDeferralHistory,
  onEstimate,
}: Props) {
  if (defects.length === 0) return null;

  return (
    <div className="bg-sev-yellow-bg/15">
      {/* Section break — small-caps zone marker between events and defects */}
      <div className="flex items-center gap-3 border-t border-foreground/20 bg-card px-3 py-1.5">
        <span className="label-eyebrow-strong text-sev-yellow-fg">
          Defects · {defects.length} open
        </span>
        <span className="section-rule" />
      </div>
      {/* Column header — sub-titles for the swapped final columns
          (Reported / TTAF replace Due-date / TTAF / Days / Hours) */}
      <div
        className={cn(
          "grid items-end gap-0 px-3 py-1 text-[9px] font-semibold uppercase tracking-spec text-muted-foreground border-b border-foreground/10",
          DEFECTS_GRID_COLS,
        )}
      >
        <span className="px-1">WO</span>
        <span className="px-1">REQ</span>
        <span className="pl-3.5">Defect</span>
        <span>Status</span>
        <span>Estimate</span>
        <span className="border-l border-foreground/15 px-2 text-center">
          Reported
        </span>
        <span className="border-l border-foreground/15 px-2 text-center">
          TTAF
        </span>
        <span className="border-l border-foreground/15 px-1 text-center"></span>
        <span className="border-l border-r border-foreground/15 px-1 text-center"></span>
        <span className="text-right pl-2">{readOnly ? "" : "Actions"}</span>
      </div>
      {defects.map((d) => {
        const planStatus = getDefectPlanStatus(d, bookedDefectIds);
        const deferralStatus = getDeferralStatus(d);
        return (
          <div
            key={d.id}
            className={cn(
              "grid items-center gap-0 px-3 py-1 border-t border-foreground/10 text-xs hover:bg-foreground/[0.025]",
              DEFECTS_GRID_COLS,
              deferralStatus === "overdue" &&
                "bg-sev-red-bg/30 hover:bg-sev-red-bg/40",
            )}
          >
            <div className="pr-2">
              <WorkOrderCell
                value={d.workOrderNumber}
                readOnly={readOnly}
                onSave={(wo) => updateDefect(d.id, { workOrderNumber: wo })}
              />
            </div>
            <div className="pr-2">
              <WorkOrderCell
                value={d.requisitionNumber}
                readOnly={readOnly}
                onSave={(req) =>
                  updateDefect(d.id, { requisitionNumber: req })
                }
                placeholder="REQ number"
                editTitle="Click to edit requisition number"
              />
            </div>
            <div className="flex items-center gap-2 min-w-0 pl-3.5 pr-2">
              <DeferralPill
                status={deferralStatus}
                defect={d}
                onClick={() => onViewDeferralHistory(d)}
              />
              <span className="truncate" title={d.title}>
                {d.title}
              </span>
            </div>
            <div className="pr-2">
              <span
                className={cn(
                  "inline-flex items-center border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-spec",
                  PLAN_STATUS_CLASS[planStatus],
                )}
                title={
                  planStatus === "booked"
                    ? "WO assigned and a calendar block is linked to this defect"
                    : planStatus === "planned"
                      ? "Work order assigned — no hangar slot booked yet"
                      : "No work order assigned yet"
                }
              >
                {PLAN_STATUS_LABEL[planStatus]}
              </span>
            </div>
            <div className="pr-2">
              <EstimatePill
                estimated={d.estimated}
                estimatedManHours={d.estimatedManHours}
                readOnly={readOnly}
                onClick={() => onEstimate(d)}
              />
            </div>
            <div className="border-l border-foreground/15 px-2 py-0.5 text-center font-mono text-[11px] tabular-nums">
              {formatDate(d.reportedDate)}
            </div>
            <div className="border-l border-foreground/15 px-2 py-0.5 text-center font-mono text-[11px] tabular-nums">
              {formatMinutesAsDuration(d.reportedTtafMinutes)}
            </div>
            {/* Two unused cells to align with the events grid (Days/Hours
                cells don't apply to defects). Render hairline dividers
                so the column rhythm is preserved. */}
            <div className="border-l border-foreground/15 px-1 py-0.5 text-center text-muted-foreground/60">
              —
            </div>
            <div className="border-l border-r border-foreground/15 px-1 py-0.5 text-center text-muted-foreground/60">
              —
            </div>
            <div className="flex items-center justify-end gap-px pl-2">
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => onDefer(d)}
                    title={
                      deferralStatus === "none"
                        ? "Defer defect (start 30-day review)"
                        : "Manage deferral"
                    }
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center border border-transparent transition-colors hover:border-foreground/20 hover:bg-foreground/[0.06]",
                      deferralStatus !== "none" &&
                        "text-sev-yellow-fg hover:bg-sev-yellow-bg/60",
                    )}
                  >
                    <Clock className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolve(d)}
                    title="Resolve defect"
                    className="inline-flex h-6 w-6 items-center justify-center border border-transparent text-sev-green-fg transition-colors hover:border-sev-green-edge/40 hover:bg-sev-green-bg/60"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(d)}
                    title="Edit defect"
                    className="inline-flex h-6 w-6 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(d)}
                    title="Delete defect"
                    className="inline-flex h-6 w-6 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-sev-red-edge/40 hover:bg-sev-red-bg/60 hover:text-sev-red-fg"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
