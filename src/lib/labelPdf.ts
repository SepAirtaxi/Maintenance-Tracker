import { jsPDF } from "jspdf";

export interface FolderLabel {
  tail: string; // e.g. "OY-CDL"
  wo: string; // work order number, digits
  task: string; // task description
}

// 90 x 60 mm folder label, tiled onto A4. Design echoes the app's Hangar
// language — hairline frame, small-caps eyebrows, instrument-style tail/WO —
// while staying legible at a glance on a hard folder.
const LABEL_W = 90;
const LABEL_H = 50;
const COLS = 2;
const OUTER_X = 12; // side margin
const GUTTER_X = 6; // gap between columns
const TOP_Y = 15; // top margin
const BOTTOM_Y = 15; // bottom margin — keep labels inside the printable area
const GUTTER_Y = 8; // gap between rows

// Rows that fit on one A4 (297mm tall) between the top and bottom margins.
const ROWS = Math.floor(
  (297 - TOP_Y - BOTTOM_Y + GUTTER_Y) / (LABEL_H + GUTTER_Y),
);
const PER_PAGE = COLS * ROWS;

const INK: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [130, 130, 130];
const HAIR: [number, number, number] = [150, 150, 150];

// Approx. mm height of a line of text at a given point size (1pt = 0.3528mm).
const PT_TO_MM = 0.3528;

function drawLabel(pdf: jsPDF, x: number, y: number, label: FolderLabel) {
  const pad = 6;
  const innerW = LABEL_W - 2 * pad;
  const left = x + pad;

  // Frame — hairline, zero radius (doubles as the cut line).
  pdf.setDrawColor(INK[0], INK[1], INK[2]);
  pdf.setLineWidth(0.3);
  pdf.rect(x, y, LABEL_W, LABEL_H);

  const setInk = (
    style: string,
    size: number,
    color: [number, number, number],
  ) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };

  const eyebrow = (text: string, ty: number) => {
    setInk("bold", 7, MUTED);
    // fake letter-spacing for the small-caps spec look
    pdf.text(text.toUpperCase(), left, ty, {
      baseline: "top",
      charSpace: 0.6,
    });
  };

  // The label is divided into three stacked zones that together span the full
  // height. Content is anchored to zone tops/bottoms so the whole face is used
  // rather than crowding the top quarter.

  // --- Aircraft / tail number (top zone) ---
  eyebrow("Aircraft", y + 4.5);
  setInk("bold", 32, INK);
  pdf.text(label.tail.toUpperCase() || "OY-", left, y + 9.5, {
    baseline: "top",
  });

  // hairline divider between identity and the WO/task ledger
  const divY = y + 23;
  pdf.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
  pdf.setLineWidth(0.2);
  pdf.line(left, divY, x + LABEL_W - pad, divY);

  // --- Work order (middle zone) ---
  eyebrow("Work Order", divY + 3);
  setInk("bold", 22, INK);
  const woText = label.wo ? "WO " + label.wo : "WO ————";
  pdf.text(woText, left, divY + 7.5, { baseline: "top" });

  // --- Task description (bottom zone, adaptive) ---
  // The task usually runs 1–2 lines, so size it up to fill the remaining
  // space when short and step down only when it actually needs to wrap.
  const taskEyebrowY = y + 37;
  eyebrow("Task", taskEyebrowY);

  const taskText = (label.task || "").toUpperCase();
  const taskBottom = y + LABEL_H - pad; // baseline the block sits above

  // Try large first; fall back a step at a time until it fits in ≤2 lines.
  const CANDIDATES = [17, 15, 13, 11, 10];
  let taskSize = CANDIDATES[CANDIDATES.length - 1];
  let taskLines: string[] = [];
  for (const size of CANDIDATES) {
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(taskText, innerW);
    if (lines.length <= 2) {
      taskSize = size;
      taskLines = lines;
      break;
    }
    // keep the smallest candidate's 2 lines as the last-resort fallback
    taskSize = size;
    taskLines = lines.slice(0, 2);
  }

  setInk("bold", taskSize, INK);
  const lineH = taskSize * PT_TO_MM * 1.18;
  // Bottom-align the task block to the bottom padding line so a single big
  // line drops to the floor and a two-line block stacks up from there.
  let ty = taskBottom - taskLines.length * lineH;
  // Never collide with the eyebrow.
  ty = Math.max(ty, taskEyebrowY + 4);
  for (const line of taskLines) {
    pdf.text(line, left, ty, { baseline: "top" });
    ty += lineH;
  }
}

// Builds an A4 PDF with the given labels tiled across the page(s) and triggers
// a download. Each entry is independent (its own tail / WO / task).
export function buildLabelsPdf(labels: FolderLabel[]): void {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });

  labels.forEach((label, i) => {
    const onPage = i % PER_PAGE;
    if (i > 0 && onPage === 0) pdf.addPage();
    const col = onPage % COLS;
    const row = Math.floor(onPage / COLS);
    const x = OUTER_X + col * (LABEL_W + GUTTER_X);
    const y = TOP_Y + row * (LABEL_H + GUTTER_Y);
    drawLabel(pdf, x, y, label);
  });

  const stamp = new Date().toISOString().slice(0, 10);
  pdf.save("Folder labels " + stamp + ".pdf");
}
