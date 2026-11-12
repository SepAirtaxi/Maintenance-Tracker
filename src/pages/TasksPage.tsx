import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { subscribeUsers } from "@/services/users";
import {
  addTasks,
  completeTask,
  reopenTask,
  reorderTasks,
  subscribeTasks,
} from "@/services/tasks";
import TaskColumn from "@/components/tasks/TaskColumn";
import { EditTaskDialog, PasteTasksDialog } from "@/components/tasks/TaskDialogs";
import type { Task, UserProfile } from "@/types";

type Desk = { person: UserProfile; active: Task[]; done: Task[] };

const nameOf = (u: UserProfile) => (u.displayName ?? "").trim() || u.email;

export default function TasksPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => subscribeUsers(setUsers), []);
  useEffect(
    () =>
      subscribeTasks(setTasks, (err) =>
        setLoadError(err.message || "Couldn't load tasks."),
      ),
    [],
  );

  const myUid = profile?.uid ?? null;

  // One desk per named member — yours first, the rest alphabetically. Members
  // who haven't set a name yet are still behind the profile gate, so they
  // can't have tasks and are left off the board.
  const desks = useMemo<Desk[]>(() => {
    if (!users) return [];
    const byOwner = new Map<string, Task[]>();
    for (const t of tasks ?? []) {
      const list = byOwner.get(t.ownerUid) ?? [];
      list.push(t);
      byOwner.set(t.ownerUid, list);
    }
    return users
      .filter((u) => (u.displayName ?? "").trim() || byOwner.has(u.uid))
      .sort((a, b) => {
        if (a.uid === myUid) return -1;
        if (b.uid === myUid) return 1;
        return nameOf(a).localeCompare(nameOf(b), "da");
      })
      .map((person) => {
        const own = byOwner.get(person.uid) ?? [];
        return {
          person,
          active: own
            .filter((t) => !t.done)
            .sort(
              (a, b) =>
                a.rank - b.rank || a.createdAt.toMillis() - b.createdAt.toMillis(),
            ),
          done: own.filter((t) => t.done),
        };
      });
  }, [users, tasks, myUid]);

  const myDesk = desks.find((d) => d.person.uid === myUid);
  const myBottomRank = myDesk?.active.length
    ? Math.max(...myDesk.active.map((t) => t.rank))
    : -1;
  const totalActive = desks.reduce((n, d) => n + d.active.length, 0);

  const attempt = async (fn: () => Promise<unknown>, fallback: string) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : fallback);
      throw err;
    }
  };
  const fire = (fn: () => Promise<unknown>, fallback: string) =>
    void attempt(fn, fallback).catch(() => {});

  const loading = (users === null || tasks === null) && !loadError;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            07 / Tasks
          </span>
          <span className="h-px w-12 flex-1 bg-foreground/15" />
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold leading-none tracking-tight">
              Tasks
            </h1>
            <p className="text-sm text-muted-foreground">
              What's on everyone's desk. Add and reorder your own notes. Drag them,
              or use the arrows, with the most important at the top.
            </p>
          </div>
          {!loading && (
            <div className="flex shrink-0 items-baseline gap-4">
              <span className="flex items-baseline gap-1.5">
                <span className="readout text-2xl font-bold leading-none">{desks.length}</span>
                <span className="label-eyebrow">people</span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="readout text-2xl font-bold leading-none">{totalActive}</span>
                <span className="label-eyebrow">active tasks</span>
              </span>
            </div>
          )}
        </div>
      </header>

      {(loadError || actionError) && (
        <p
          className="border border-sev-red-edge/50 bg-sev-red-bg px-3 py-2 text-sm text-sev-red-fg"
          role="alert"
        >
          {loadError ?? actionError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : (
        <div className="grid grid-flow-col auto-cols-[minmax(300px,1fr)] gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {desks.map((d) => {
            const isMine = d.person.uid === myUid;
            return (
              <TaskColumn
                key={d.person.uid}
                person={d.person}
                isMine={isMine}
                active={d.active}
                done={d.done}
                onAdd={(title, detail) =>
                  attempt(
                    () => addTasks([{ title, detail }], myBottomRank),
                    "Couldn't add the task.",
                  ).then(
                    () => undefined,
                  )
                }
                onReorder={(ordered) =>
                  fire(() => reorderTasks(ordered), "Couldn't save the new order.")
                }
                onComplete={(t) => fire(() => completeTask(t.id), "Couldn't mark it done.")}
                onReopen={(t) =>
                  fire(() => reopenTask(t.id, myBottomRank), "Couldn't put it back.")
                }
                onEdit={setEditing}
                onPaste={() => setPasteOpen(true)}
              />
            );
          })}
        </div>
      )}

      <PasteTasksDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        bottomRank={myBottomRank}
      />
      <EditTaskDialog task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
