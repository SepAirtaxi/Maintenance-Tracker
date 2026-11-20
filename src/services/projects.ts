import {
  Timestamp,
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requireCurrentUserCtx } from "@/lib/currentUser";
import { normaliseTailNumber } from "@/lib/tails";
import type {
  Project,
  ProjectCurrency,
  ProjectStage,
  ProjectStageChange,
} from "@/types";

const projectsCol = () => collection(db, "projects");
const projectDoc = (id: string) => doc(db, "projects", id);

type TsMap = Partial<Record<ProjectStage, Timestamp>>;

function docToProject(id: string, data: Record<string, unknown>): Project {
  const now = Timestamp.now();
  return {
    id,
    title: (data.title as string) ?? "",
    tailNumber: (data.tailNumber as string) ?? "",
    customer: (data.customer as string | null) ?? null,
    responsible: (data.responsible as string | null) ?? null,
    aircraftType: (data.aircraftType as string | null) ?? null,
    openedDate: (data.openedDate as Timestamp) ?? now,
    quoteAmount: (data.quoteAmount as number | null) ?? null,
    quoteCurrency: (data.quoteCurrency as ProjectCurrency) ?? "DKK",
    quoteDate: (data.quoteDate as Timestamp | null) ?? null,
    quoteNumber: (data.quoteNumber as string | null) ?? null,
    workOrderNumber: (data.workOrderNumber as string | null) ?? null,
    stage: (data.stage as ProjectStage) ?? "rfq",
    stageEnteredAt: (data.stageEnteredAt as Timestamp) ?? now,
    stageReachedAt: (data.stageReachedAt as TsMap) ?? {},
    stageTargets: (data.stageTargets as TsMap) ?? {},
    stageHistory: (data.stageHistory as ProjectStageChange[]) ?? [],
    notes: (data.notes as string | null) ?? null,
    createdAt: (data.createdAt as Timestamp) ?? now,
    createdBy: (data.createdBy as string) ?? "",
    updatedAt: (data.updatedAt as Timestamp) ?? now,
  };
}

export function subscribeProjects(
  callback: (projects: Project[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    projectsCol(),
    (snap) => {
      callback(
        snap.docs.map((d) =>
          docToProject(d.id, d.data({ serverTimestamps: "estimate" })),
        ),
      );
    },
    (err) => onError?.(err),
  );
}

export type ProjectInput = {
  title: string;
  tailNumber: string;
  customer: string | null;
  responsible: string;
  aircraftType: string | null;
  openedDate: Date;
  quoteAmount: number | null;
  quoteCurrency: ProjectCurrency;
  quoteDate: Date | null;
  quoteNumber: string | null;
  workOrderNumber: string | null;
  notes: string | null;
  // Per-stage "finish by" dates. A stage missing from the map has no target.
  stageTargets: Partial<Record<ProjectStage, Date>>;
};

const clean = (s: string | null): string | null => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

function normalise(input: ProjectInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Project title is required.");
  const tailNumber = normaliseTailNumber(input.tailNumber);
  if (!tailNumber) throw new Error("Tail number is required.");
  const responsible = input.responsible.trim();
  if (!responsible) throw new Error("Responsible / contact person is required.");
  if (input.quoteAmount != null && !(input.quoteAmount >= 0)) {
    throw new Error("Quoted cost must be a positive number.");
  }
  const stageTargets: TsMap = {};
  for (const [k, d] of Object.entries(input.stageTargets)) {
    if (d) stageTargets[k as ProjectStage] = Timestamp.fromDate(d);
  }
  return {
    title,
    tailNumber,
    customer: clean(input.customer),
    responsible,
    aircraftType: clean(input.aircraftType),
    openedDate: Timestamp.fromDate(input.openedDate),
    quoteAmount: input.quoteAmount,
    quoteCurrency: input.quoteCurrency,
    quoteDate: input.quoteDate ? Timestamp.fromDate(input.quoteDate) : null,
    quoteNumber: clean(input.quoteNumber),
    workOrderNumber: clean(input.workOrderNumber),
    notes: clean(input.notes),
    stageTargets,
  };
}

export async function createProject(
  input: ProjectInput,
  initialStage: ProjectStage,
): Promise<string> {
  const user = requireCurrentUserCtx();
  const data = normalise(input);
  const now = Timestamp.now();
  // Back-date the stages we know dates for, so a project entered mid-flight
  // still shows when the RFQ came in and when the quote went out.
  const stageReachedAt: TsMap = { rfq: data.openedDate };
  if (data.quoteDate) stageReachedAt.quoted = data.quoteDate;
  if (!stageReachedAt[initialStage]) stageReachedAt[initialStage] = now;

  const ref = await addDoc(projectsCol(), {
    ...data,
    stage: initialStage,
    stageEnteredAt: now,
    stageReachedAt,
    stageHistory: [{ stage: initialStage, at: now, by: user.initials }],
    createdAt: serverTimestamp(),
    createdBy: user.initials,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProject(
  id: string,
  input: ProjectInput,
): Promise<void> {
  const data = normalise(input);
  await updateDoc(projectDoc(id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function setProjectStage(
  project: Project,
  stage: ProjectStage,
): Promise<void> {
  if (project.stage === stage) return;
  const user = requireCurrentUserCtx();
  const now = Timestamp.now();
  const update: Record<string, unknown> = {
    stage,
    stageEnteredAt: now,
    [`stageReachedAt.${stage}`]: now,
    stageHistory: arrayUnion({ stage, at: now, by: user.initials }),
    updatedAt: serverTimestamp(),
  };
  // Sending the quote is the moment the quote date is known — fill it in
  // when nobody has yet. It stays editable in the project form.
  if (stage === "quoted" && !project.quoteDate) update.quoteDate = now;
  await updateDoc(projectDoc(project.id), update);
}

// Quick set/clear of the current stage's target from the card.
export async function setStageTarget(
  project: Project,
  stage: ProjectStage,
  date: Date | null,
): Promise<void> {
  await updateDoc(projectDoc(project.id), {
    [`stageTargets.${stage}`]: date ? Timestamp.fromDate(date) : deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  await deleteDoc(projectDoc(projectId));
}
