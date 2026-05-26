import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { classifyEngineType, type EngineType } from "@/lib/tails";
import {
  createEventTemplate,
  updateEventTemplate,
} from "@/services/eventTemplates";
import type { Aircraft, EventTemplate } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EventTemplate | null;
  fleet: Aircraft[];
};

const GROUP_LABEL: Record<EngineType, string> = {
  piston: "Piston",
  turboprop: "Turboprop",
};

const GROUP_ORDER: EngineType[] = ["piston", "turboprop"];

export default function EventTemplateFormDialog({
  open,
  onOpenChange,
  template,
  fleet,
}: Props) {
  const isEdit = template !== null;
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setSelected(new Set(template?.tailNumbers ?? []));
    setActive(template?.active ?? true);
    setError(null);
    setSaving(false);
  }, [open, template]);

  const groups = useMemo(() => {
    const map = new Map<EngineType, Aircraft[]>();
    for (const a of fleet) {
      const kind = classifyEngineType(a.model);
      const arr = map.get(kind) ?? [];
      arr.push(a);
      map.set(kind, arr);
    }
    for (const arr of map.values()) {
      arr.sort((x, y) => x.tailNumber.localeCompare(y.tailNumber));
    }
    return GROUP_ORDER.map((k) => ({
      kind: k,
      aircraft: map.get(k) ?? [],
    })).filter((g) => g.aircraft.length > 0);
  }, [fleet]);

  const toggleOne = (tail: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tail)) next.delete(tail);
      else next.add(tail);
      return next;
    });
  };

  const toggleGroup = (tails: string[], targetAll: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (targetAll) tails.forEach((t) => next.add(t));
      else tails.forEach((t) => next.delete(t));
      return next;
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const tails = Array.from(selected);
      if (isEdit && template) {
        await updateEventTemplate(template.id, {
          title,
          tailNumbers: tails,
          active,
        });
      } else {
        await createEventTemplate({ title, tailNumbers: tails, active });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,640px)] w-[min(96vw,640px)]">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? `Edit ${template?.title}` : "Add scheduled event"}
            </DialogTitle>
            <DialogDescription>
              Templates show up in the event form's "From template" picker and
              drive the Missing list. Tick the aircraft this template applies
              to.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tplTitle">Title</Label>
              <Input
                id="tplTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. 50 Hour Inspection"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <Label>Applies to</Label>
                <span className="text-[10px] font-bold uppercase tracking-spec text-muted-foreground">
                  {selected.size} of {fleet.length} selected
                </span>
              </div>
              <div className="border border-foreground/20 bg-card divide-y divide-foreground/10 max-h-[320px] overflow-y-auto">
                {groups.map((g) => {
                  const tails = g.aircraft.map((a) => a.tailNumber);
                  const allChecked = tails.every((t) => selected.has(t));
                  const someChecked = tails.some((t) => selected.has(t));
                  return (
                    <div key={g.kind}>
                      <label
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 bg-foreground/[0.04] cursor-pointer select-none",
                          "text-[10px] font-bold uppercase tracking-spec text-muted-foreground",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 border-input"
                          checked={allChecked}
                          ref={(el) => {
                            if (el) el.indeterminate = !allChecked && someChecked;
                          }}
                          onChange={(e) => toggleGroup(tails, e.target.checked)}
                        />
                        <span>{GROUP_LABEL[g.kind]} · {tails.length}</span>
                      </label>
                      {g.aircraft.map((a) => (
                        <label
                          key={a.tailNumber}
                          className="flex items-center gap-3 px-3 py-1.5 text-sm cursor-pointer select-none hover:bg-foreground/[0.025]"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 border-input"
                            checked={selected.has(a.tailNumber)}
                            onChange={() => toggleOne(a.tailNumber)}
                          />
                          <span className="font-mono font-bold tracking-stamp w-24">
                            {a.tailNumber}
                          </span>
                          <span className="text-muted-foreground">
                            {a.model}
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 border-input"
              />
              <span>
                Active{" "}
                <span className="text-muted-foreground">
                  (inactive templates don't appear in pickers or the Missing
                  list)
                </span>
              </span>
            </label>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Add scheduled event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
