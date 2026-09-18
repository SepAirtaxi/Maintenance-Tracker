// Orchestrator: ERP "Aircraft Status" PDF → header + records + the three
// candidate lists the maintenance statement picks from.
//
// Split in two phases like the forecast module, so a caller can read the tail
// number off the header and check it against the aircraft on screen before
// doing anything with the contents.

import { extractTextItems } from "./pdf";
import { parseComplianceHeader } from "./parseHeader";
import { parseRecords } from "./layout";
import { buildStopBlocks, type BuildOptions } from "./stopBlocks";
import type { ComplianceHeader, ComplianceRecord, ComplianceReport } from "./types";

export type RawComplianceParse = {
  header: ComplianceHeader;
  records: ComplianceRecord[];
};

export async function parseComplianceReportRaw(
  input: ArrayBuffer | Blob,
): Promise<RawComplianceParse> {
  const items = await extractTextItems(input);
  const header = parseComplianceHeader(items);
  const records = parseRecords(items);

  if (!header.tailNumber)
    throw new Error(
      "No tail number found — this does not look like an Aircraft Status report.",
    );
  if (records.length === 0)
    throw new Error("No compliance events found in the report.");

  return { header, records };
}

export function interpret(
  raw: RawComplianceParse,
  opts: BuildOptions = {},
): ComplianceReport {
  const { hours, dates, cycles, warnings } = buildStopBlocks(
    raw.header,
    raw.records,
    opts,
  );
  return { ...raw, hours, dates, cycles, warnings };
}

export async function parseComplianceReport(
  input: ArrayBuffer | Blob,
  opts: BuildOptions = {},
): Promise<ComplianceReport> {
  return interpret(await parseComplianceReportRaw(input), opts);
}

export * from "./types";
