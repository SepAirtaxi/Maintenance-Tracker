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
import {
  TASK_DETAIL_MAX,
  TASK_TITLE_MAX,
  addTasks,
  deleteTask,
  updateTask,
} from "@/services/tasks";
import type { Task } from "@/types";

const textareaClass =
  "flex w-full border border-foreground/30 bg-card px-3 py-2 text-sm placeholder:text-muted-foreground placeholder:italic focus-visible:outline-none focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-accent/60 resize-y";

// Strips the bullet / numbering people tend to paste in from notes, mails
// and Word lists: "- ", "• ", "1. ", "2) ", "[ ] ", etc.
const BULLET = /^\s*(?:[-*•·▪◦–—>]+|\d{1,3}[.)]|\[[ xX]?\])\s*/;

export function parsePastedTasks(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET, "").trim())
    .filter(Boolean)
    .map((line) => line.slice(0, TASK_TITLE_MAX));
}

export function PasteTasksDialog({
  open,
  onOpenChange,
  bottomRank,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bottomRank: number;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setSaving(false);
      setError(null);
    }
  }, [open]);

  const lines = useMemo(() => parsePastedTasks(text), [text]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await addTasks(lines.map((title) => ({ title })), bottomRank);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the tasks.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Paste a list</DialogTitle>
            <DialogDescription>
              One task per line. Bullets and numbering are stripped. They're
              added to the bottom of your list in this order.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            autoFocus
            placeholder={"- Chase CAMO on OY-CMC AMP revision\n- Order spare ELT battery\n- Update tooling calibration list"}
            className={textareaClass}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter className="items-center">
            <span className="label-eyebrow sm:mr-auto">
              <span className="readout text-foreground">{lines.length}</span>{" "}
              {lines.length === 1 ? "task" : "tasks"}
            </span>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || lines.length === 0}>
              {saving ? "Adding…" : `Add ${lines.length || ""}`.trim()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditTaskDialog({
  task,
  onClose,
}: {
  task: Task | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDetail(task.detail ?? "");
    setSaving(false);
    setDeleteArmed(false);
    setError(null);
  }, [task]);

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!task || !title.trim()) return;
    void run(() => updateTask(task.id, { title, detail }));
  };

  return (
    <Dialog open={task !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="taskTitle">Task</Label>
            <Input
              id="taskTitle"
              value={title}
              maxLength={TASK_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="taskDetail">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id="taskDetail"
              value={detail}
              maxLength={TASK_DETAIL_MAX}
              onChange={(e) => setDetail(e.target.value)}
              rows={4}
              placeholder="Context, who you're waiting on, where it's filed…"
              className={textareaClass}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant={deleteArmed ? "destructive" : "ghost"}
              className="sm:mr-auto"
              disabled={saving}
              onClick={() =>
                deleteArmed
                  ? task && void run(() => deleteTask(task.id))
                  : setDeleteArmed(true)
              }
            >
              {deleteArmed ? "Delete for good" : "Delete"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
