import { FormEvent, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { toIso } from "@/lib/dmy";
import { stageDef } from "@/lib/projectStages";
import { deleteProject, setStageTarget } from "@/services/projects";
import type { Project } from "@/types";

// Quick set / clear of the current stage's target date, from the card.
export function StageTargetDialog({
  project,
  onClose,
}: {
  project: Project | null;
  onClose: () => void;
}) {
  const [iso, setIso] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    const ts = project.stageTargets[project.stage];
    setIso(ts ? toIso(ts.toDate()) : "");
    setSaving(false);
    setError(null);
  }, [project]);

  const def = project ? stageDef(project.stage) : null;
  const hadTarget = !!(project && project.stageTargets[project.stage]);

  const save = async (value: string) => {
    if (!project) return;
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
    setSaving(true);
    setError(null);
    try {
      await setStageTarget(project, project.stage, date);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!iso) return;
    void save(iso);
  };

  return (
    <Dialog open={project !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Stage target</DialogTitle>
            <DialogDescription>
              {project?.tailNumber} · {project?.title} — currently in{" "}
              <span className="font-semibold text-foreground">{def?.label}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="stageTarget">{def?.targetLabel}</Label>
            <DateInput id="stageTarget" value={iso} onChange={setIso} required />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            {hadTarget && (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                disabled={saving}
                onClick={() => void save("")}
              >
                Clear target
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !iso}>
              {saving ? "Saving…" : "Set target"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProjectDialog({
  project,
  onClose,
}: {
  project: Project | null;
  onClose: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) setError(null);
  }, [project]);

  const onConfirm = async () => {
    if (!project) return;
    setWorking(true);
    setError(null);
    try {
      await deleteProject(project.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={project !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {project?.title}?</DialogTitle>
          <DialogDescription>
            This removes the project for good. If it's simply finished or the
            customer declined, move it to Completed or Quote rejected instead —
            it then stays under the Closed filter.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={working}
          >
            {working ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
