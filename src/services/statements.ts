import {
  Bytes,
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/lib/firebase";
import { logAudit } from "@/services/audit";
import { normaliseTailNumber } from "@/lib/tails";
import type { LatestStatement, StatementVariant, StoredStatement } from "@/types";

// The generated statements run ~50 kB — a full page of text plus the company
// logo. Firestore caps a document at 1 MiB, so this leaves an order of
// magnitude of headroom while still refusing anything that would be rejected
// by the server with a less legible error. If this ever trips, the logo is the
// thing that grew.
const MAX_STATEMENT_BYTES = 900_000;

const statementDoc = (tailNumber: string) =>
  doc(db, "aircraft", normaliseTailNumber(tailNumber), "statements", "latest");

const aircraftDoc = (tailNumber: string) =>
  doc(db, "aircraft", normaliseTailNumber(tailNumber));

function describeVariant(variant: StatementVariant): string {
  return variant === "temp" ? "Temporary statement" : "Maintenance statement";
}

export type AttachStatementInput = {
  tailNumber: string;
  variant: StatementVariant;
  workOrder: string;
  // The date printed on the document. Always today in practice, but passed in
  // rather than assumed so the stored date can never drift from the PDF.
  printed: Date;
  issuedBy: string;
  issuedByUid: string;
  fileName: string;
  bytes: Uint8Array;
};

// File a freshly generated statement as the current valid one for a tail.
// Writes the PDF to its own document and the pointer onto the aircraft in one
// batch, so the card can never show a date with no document behind it. Any
// statement already on file is overwritten — only the current one is kept.
export async function attachStatement(
  input: AttachStatementInput,
): Promise<void> {
  const tail = normaliseTailNumber(input.tailNumber);
  if (!tail) throw new Error("A registration is required.");
  if (input.bytes.byteLength > MAX_STATEMENT_BYTES) {
    throw new Error(
      `The generated statement is ${Math.round(
        input.bytes.byteLength / 1024,
      )} kB, which is too large to link to the aircraft.`,
    );
  }

  const existing = await getDoc(aircraftDoc(tail));
  if (!existing.exists()) throw new Error(`Aircraft ${tail} not found.`);
  const previous = (existing.data().latestStatement ?? null) as
    | LatestStatement
    | null;

  const meta: LatestStatement = {
    variant: input.variant,
    workOrder: input.workOrder,
    printedAt: Timestamp.fromDate(input.printed),
    issuedBy: input.issuedBy,
    issuedByUid: input.issuedByUid,
    fileName: input.fileName,
    sizeBytes: input.bytes.byteLength,
  };

  const stored: StoredStatement = {
    ...meta,
    tailNumber: tail,
    pdf: Bytes.fromUint8Array(input.bytes),
  };

  const batch = writeBatch(db);
  batch.set(statementDoc(tail), stored);
  batch.update(aircraftDoc(tail), {
    latestStatement: meta,
    updatedAt: serverTimestamp(),
  });
  logAudit(
    tail,
    {
      action: previous ? "update" : "create",
      entity: "statement",
      summary: previous
        ? `${describeVariant(input.variant)} linked (WO ${input.workOrder}) — replaced the ${describeVariant(
            previous.variant,
          ).toLowerCase()} of ${format(
            previous.printedAt.toDate(),
            "dd.MM.yyyy",
          )} (WO ${previous.workOrder})`
        : `${describeVariant(input.variant)} linked (WO ${input.workOrder})`,
    },
    batch,
  );
  await batch.commit();
}

// Fetch the stored PDF for a tail. Called only when someone opens the viewer —
// nothing on the overview touches this.
export async function getStatementPdf(
  tailNumber: string,
): Promise<Uint8Array | null> {
  const snap = await getDoc(statementDoc(tailNumber));
  if (!snap.exists()) return null;
  const data = snap.data() as StoredStatement;
  return data.pdf?.toUint8Array() ?? null;
}
