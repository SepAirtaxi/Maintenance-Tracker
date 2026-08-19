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

  // Fixed vertical rhythm. Three stacked zones (aircraft / work order / task)
  // spread down the full height. Every eyebrow sits EYE_GAP above its value so
  // the label→value pairing reads consistently; the larger gaps between zones
  // give each section room to breathe without any overlap.
  const EYE_GAP = 4; // eyebrow top → value top

  // --- Aircraft / tail number (top zone) ---
  const aircraftEyeY = y + 5;
  eyebrow("Aircraft", aircraftEyeY);
  setInk("bold", 30, INK);
  pdf.text(label.tail.toUpperCase() || "OY-", left, aircraftEyeY + EYE_GAP, {
    baseline: "top",
  });

  // hairline divider between identity and the WO/task ledger. Sits clear of the
  // tail's baseline with a comfortable gap above, grouped to the WO zone below.
  const divY = y + 20.5;
  pdf.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
  pdf.setLineWidth(0.2);
  pdf.line(left, divY, x + LABEL_W - pad, divY);

  // --- Work order (middle zone) ---
  const woEyeY = divY + 2.5;
  eyebrow("Work Order", woEyeY);
  setInk("bold", 21, INK);
  const woText = label.wo ? "WO " + label.wo : "WO ————";
  pdf.text(woText, left, woEyeY + EYE_GAP, { baseline: "top" });

  // --- Task description (bottom zone, adaptive) ---
  // The task usually runs 1–2 lines, so size it up to fill the space when
  // short and step down only when it actually needs to wrap to a second line.
  const taskEyeY = y + 35;
  eyebrow("Task", taskEyeY);

  const taskText = (label.task || "").toUpperCase();
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
    // smallest candidate: accept its first two lines as a last resort
    taskSize = size;
    taskLines = lines.slice(0, 2);
  }

  setInk("bold", taskSize, INK);
  const lineH = taskSize * PT_TO_MM * 1.18;
  let ty = taskEyeY + EYE_GAP;
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
