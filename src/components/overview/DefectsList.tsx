import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import type { Defect } from "@/types";

type Props = {
  defects: Defect[];
  onAdd: () => void;
  onEdit: (defect: Defect) => void;
  onDelete: (defect: Defect) => void;
};

export default function DefectsList({
  defects,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Defects{defects.length > 0 && ` (${defects.length})`}
        </h3>
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Report defect
        </Button>
      </div>
      <div className="mt-2 rounded-md border">
        {defects.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            No defects reported.
          </p>
        )}
        {defects.map((d) => (
          <div
            key={d.id}
            className="grid grid-cols-12 items-center gap-3 px-3 py-2 border-t first:border-t-0 text-sm"
          >
            <div className="col-span-6 min-w-0">
              <div className="truncate" title={d.title}>
                {d.title}
              </div>
            </div>
            <div className="col-span-3 flex flex-col">
              <span className="text-xs text-muted-foreground">Reported</span>
              <span className="font-mono">{formatDate(d.reportedDate)}</span>
            </div>
            <div className="col-span-2 flex flex-col">
              <span className="text-xs text-muted-foreground">TTAF</span>
              <span className="font-mono">
                {formatMinutesAsDuration(d.reportedTtafMinutes)}
              </span>
            </div>
            <div className="col-span-1 flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(d)}
                title="Edit defect"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(d)}
                title="Delete defect"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
