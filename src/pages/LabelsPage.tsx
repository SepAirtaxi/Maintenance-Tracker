import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildLabelsPdf, type FolderLabel } from "@/lib/labelPdf";

type Row = FolderLabel & { id: number };

let nextId = 1;
function blankRow(tail = "OY-"): Row {
  return { id: nextId++, tail, wo: "", task: "" };
}

export default function LabelsPage() {
  const [rows, setRows] = useState<Row[]>(() => [blankRow()]);
  const [generating, setGenerating] = useState(false);

  const update = (id: number, patch: Partial<FolderLabel>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () =>
    // carry the previous tail forward — folders are often for one aircraft
    setRows((rs) => [...rs, blankRow(rs[rs.length - 1]?.tail ?? "OY-")]);

  const removeRow = (id: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));

  const ready = rows.filter((r) => r.tail.trim() && r.wo.trim() && r.task.trim());

  const onGenerate = () => {
    if (ready.length === 0) return;
    setGenerating(true);
    try {
      buildLabelsPdf(ready.map(({ tail, wo, task }) => ({ tail, wo, task })));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="border border-foreground/20 bg-card p-6 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1 text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="h-px w-8 bg-foreground/15" />
          <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            06 / Folder Labels
          </span>
          <span className="h-px w-8 bg-foreground/15" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Folder Labels
        </h1>
        <p className="text-sm text-muted-foreground">
          One 90 × 50 mm label per row. Add as many as you need — they tile onto
          A4 pages, ready to print and cut.
        </p>
      </header>

      {/* Column header */}
      <div className="space-y-2.5">
        <div className="hidden grid-cols-[2.5rem_8rem_7rem_1fr_2.25rem] items-center gap-3 px-1 text-[10px] font-bold uppercase tracking-spec text-muted-foreground sm:grid">
          <span className="text-center">#</span>
          <span>Tail</span>
          <span>WO no.</span>
          <span>Task description</span>
          <span />
        </div>

        {rows.map((row, i) => (
          <div
            key={row.id}
            className="grid grid-cols-[2.5rem_8rem_7rem_1fr_2.25rem] items-center gap-3 border border-foreground/15 bg-background p-2.5"
          >
            <span className="text-center font-mono text-xs text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Input
              value={row.tail}
              onChange={(e) =>
                update(row.id, { tail: e.target.value.toUpperCase() })
              }
              maxLength={10}
              spellCheck={false}
              className="font-mono"
            />
            <Input
              value={row.wo}
              onChange={(e) =>
                update(row.id, { wo: e.target.value.replace(/\D/g, "") })
              }
              inputMode="numeric"
              placeholder="0000"
              className="font-mono"
            />
            <Input
              value={row.task}
              onChange={(e) => update(row.id, { task: e.target.value })}
              placeholder="100 HOUR INSPECTION"
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              disabled={rows.length === 1}
              title="Remove label"
              className="inline-flex h-9 w-9 items-center justify-center border border-foreground/25 bg-card text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4 border-t border-foreground/15 pt-6">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />
            Add label
          </Button>
          <Button size="lg" onClick={onGenerate} disabled={generating || ready.length === 0}>
            {generating ? "Generating…" : "Generate PDF"}
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {ready.length} of {rows.length} label{rows.length === 1 ? "" : "s"} ready
        </span>
      </div>
      </div>
      </div>
    </div>
  );
}
