import { Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import type { Defect } from "@/types";

const DEFECTS_GRID_COLS =
  "grid-cols-[minmax(0,1fr)_92px_92px_84px]";

type Props = {
  defects: Defect[];
  readOnly?: boolean;
  onEdit: (defect: Defect) => void;
  onDelete: (defect: Defect) => void;
  onResolve: (defect: Defect) => void;
};

export default function DefectsList({
  defects,
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
        <span>Defect ({defects.length})</span>
        <span>Reported</span>
        <span>TTAF</span>
        <span className="text-right">{readOnly ? "" : "Actions"}</span>
      </div>
      {defects.map((d) => (
        <div
          key={d.id}
          className={cn(
            "grid items-center gap-2 px-3 py-1 border-t border-amber-200/60 text-xs hover:bg-amber-100/40",
            DEFECTS_GRID_COLS,
          )}
        >
          <div className="truncate" title={d.title}>
            {d.title}
          </div>
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
      ))}
    </div>
  );
}
