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

// mm per point; cap-height ≈ 0.72em, line advance ≈ 1.16em for helvetica bold.
const PT_TO_MM = 0.3528;
const CAP = 0.72;
const LINE = 1.16;
const capH = (pt: number) => pt * PT_TO_MM * CAP;
const lineH = (pt: number) => pt * PT_TO_MM * LINE;

// Type scale.
const EYEBROW_PT = 7; // all titles, identical
const VALUE_MAX_PT = 30; // aircraft + WO share one size, capped here
const TASK_MAX_PT = 20; // task can be smaller, never larger than the values
const TITLE_TO_VALUE = 2; // gap below every title (uniform)

// One title + its value, pre-measured so the layout can place blocks by height.
interface Block {
  title: string;
  size: number;
  lines: string[];
}

function drawLabel(pdf: jsPDF, x: number, y: number, label: FolderLabel) {
  const pad = 6;
  const innerW = LABEL_W - 2 * pad;
  const left = x + pad;

  // Frame — hairline, zero radius (doubles as the cut line).
  pdf.setDrawColor(INK[0], INK[1], INK[2]);
  pdf.setLineWidth(0.3);
  pdf.rect(x, y, LABEL_W, LABEL_H);

  const setInk = (size: number, color: [number, number, number]) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };

  const widthAt = (text: string, size: number) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(size);
    return pdf.getTextWidth(text);
  };

  // --- Content ---
  const tailText = label.tail.toUpperCase() || "OY-";
  const woText = label.wo ? "WO " + label.wo : "WO ————";
  const taskText = (label.task || "").toUpperCase();

  // Aircraft + Work Order share one size: the largest (≤ cap) that fits both.
  let valueSize = VALUE_MAX_PT;
  while (
    valueSize > 12 &&
    (widthAt(tailText, valueSize) > innerW || widthAt(woText, valueSize) > innerW)
  ) {
    valueSize -= 1;
  }

  // Task is adaptive: largest size (≤ its own cap and the value size) that fits
  // on one line; if nothing fits on one line, the largest that fits on two.
  const taskCap = Math.min(TASK_MAX_PT, valueSize);
  let taskSize = 9;
  let taskLines: string[] = [taskText];
  const chooseTask = (maxLines: number) => {
    for (let s = taskCap; s >= 9; s--) {
      pdf.setFontSize(s);
      const lines = pdf.splitTextToSize(taskText, innerW);
      if (lines.length <= maxLines) {
        taskSize = s;
        taskLines = lines;
        return true;
      }
    }
    return false;
  };
  if (!chooseTask(1) && !chooseTask(2)) {
    // pathological: force smallest size, keep first two lines
    pdf.setFontSize(9);
    taskSize = 9;
    taskLines = pdf.splitTextToSize(taskText, innerW).slice(0, 2);
  }

  const blocks: Block[] = [
    { title: "Aircraft", size: valueSize, lines: [tailText] },
    { title: "Work Order", size: valueSize, lines: [woText] },
    { title: "Task", size: taskSize, lines: taskLines },
  ];

  // Height of one block = title + gap + value line(s).
  const eyeH = capH(EYEBROW_PT);
  const blockHeight = (b: Block) =>
    eyeH + TITLE_TO_VALUE + capH(b.size) + (b.lines.length - 1) * lineH(b.size);

  // Distribute the leftover height as ONE uniform gap that appears above every
  // block and below the last — so top pad, inter-block gaps and bottom pad are
  // all equal, and every title has the same space above and below it.
  const used = blocks.reduce((sum, b) => sum + blockHeight(b), 0);
  const gap = Math.max((LABEL_H - used) / (blocks.length + 1), 2);

  let cursor = y + gap;
  for (const b of blocks) {
    setInk(EYEBROW_PT, MUTED);
    pdf.text(b.title.toUpperCase(), left, cursor, {
      baseline: "top",
      charSpace: 0.6,
    });

    let vy = cursor + eyeH + TITLE_TO_VALUE;
    setInk(b.size, INK);
    for (const line of b.lines) {
      pdf.text(line, left, vy, { baseline: "top" });
      vy += lineH(b.size);
    }
    cursor += blockHeight(b) + gap;
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
