import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { updateEvent } from "@/services/events";

type Props = {
  eventId: string;
  value: string | null;
};

export default function WorkOrderCell({ eventId, value }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const commit = async () => {
    const next = draft.trim() || null;
    const current = value ?? null;
    if (next === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateEvent(eventId, { workOrderNumber: next });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
    setError(null);
  };

  if (editing) {
    return (
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">WO</span>
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              } else if (e.key === "Escape") {
                cancel();
              }
            }}
            onBlur={() => {
              // Defer so a click on the ✓ button isn't swallowed.
              setTimeout(() => {
                if (document.activeElement?.tagName !== "BUTTON") {
                  void commit();
                }
              }, 100);
            }}
            disabled={saving}
            className="h-6 px-1.5 text-xs font-mono"
            placeholder="WO number"
          />
          <button
            type="button"
            className="rounded p-0.5 hover:bg-secondary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void commit()}
            title="Save"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 hover:bg-secondary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancel}
            title="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {error && (
          <span className="text-[10px] text-destructive">{error}</span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex flex-col text-left group"
      title="Click to edit"
    >
      <span className="text-xs text-muted-foreground group-hover:text-foreground">
        WO
      </span>
      <span
        className={cn(
          "font-mono truncate group-hover:underline",
          !value && "text-muted-foreground italic",
        )}
      >
        {value ?? "add…"}
      </span>
    </button>
  );
}
