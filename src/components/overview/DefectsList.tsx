import { Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import { getDefectPlanStatus, type PlanStatus } from "@/lib/eventStatus";
import WorkOrderCell from "@/components/overview/WorkOrderCell";
import { updateDefect } from "@/services/defects";
import type { Defect } from "@/types";

const DEFECTS_GRID_COLS =
  "grid-cols-[72px_72px_minmax(0,1fr)_120px_92px_92px_84px]";

const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  unplanned: "no action",
  planned: "WO created",
  booked: "WO + booked",
};

const PLAN_STATUS_CLASS: Record<PlanStatus, string> = {
  unplanned: "bg-amber-100/70 text-amber-800",
  planned: "bg-emerald-100 text-emerald-700",
  booked: "bg-blue-100 text-blue-800",
};

type Props = {
  defects: Defect[];
  bookedDefectIds: ReadonlySet<string>;
  readOnly?: boolean;
  onEdit: (defect: Defect) => void;
  onDelete: (defect: Defect) => void;
  onResolve: (defect: Defect) => void;
};

export default function DefectsList({
  defects,
  bookedDefectIds,
  readOnly = false,
  onEdit,
  onDelete,
  onResolve,
}: Props) {
  if (defects.length === 0) return null;

  return (
    <div className="border-t bg-amber-50/40">
      <div
        className={cn(
          "grid items-center gap-2 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-800/80",
          DEFECTS_GRID_COLS,
        )}
      >
        <span>WO</span>
        <span>REQ</span>
        <span>Defect ({defects.length})</span>
        <span>Status</span>
        <span>Reported</span>
        <span>TTAF</span>
        <span className="text-right">{readOnly ? "" : "Actions"}</span>
      </div>
      {defects.map((d) => {
        const planStatus = getDefectPlanStatus(d, bookedDefectIds);
        return (
        <div
          key={d.id}
          className={cn(
            "grid items-center gap-2 px-3 py-1 border-t border-amber-200/60 text-xs hover:bg-amber-100/40",
            DEFECTS_GRID_COLS,
          )}
        >
          <WorkOrderCell
            value={d.workOrderNumber}
            readOnly={readOnly}
            onSave={(wo) => updateDefect(d.id, { workOrderNumber: wo })}
          />
          <WorkOrderCell
            value={d.requisitionNumber}
            readOnly={readOnly}
            onSave={(req) => updateDefect(d.id, { requisitionNumber: req })}
            placeholder="REQ number"
            editTitle="Click to edit requisition number"
          />
          <div className="truncate" title={d.title}>
            {d.title}
          </div>
          <span
            className={cn(
              "justify-self-start rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
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
          <div className="font-mono tabular-nums">
            {formatDate(d.reportedDate)}
          </div>
          <div className="font-mono tabular-nums">
            {formatMinutesAsDuration(d.reportedTtafMinutes)}
          </div>
          <div className="flex items-center justify-end gap-0.5">
            {!readOnly && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                  onClick={() => onResolve(d)}
                  title="Resolve defect"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onEdit(d)}
                  title="Edit defect"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onDelete(d)}
                  title="Delete defect"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}
