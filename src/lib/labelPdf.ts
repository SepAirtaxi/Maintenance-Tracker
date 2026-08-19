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

function drawLabel(pdf: jsPDF, x: number, y: number, label: FolderLabel) {
  const pad = 5;
  const innerW = LABEL_W - 2 * pad;

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
    setInk("bold", 6.5, MUTED);
    // fake letter-spacing for the small-caps spec look
    pdf.text(text.toUpperCase(), x + pad, ty, {
      baseline: "top",
      charSpace: 0.5,
    });
  };

  // --- Aircraft / tail number ---
  eyebrow("Aircraft", y + 4);
  setInk("bold", 26, INK);
  pdf.text(label.tail.toUpperCase() || "OY-", x + pad, y + 8, {
    baseline: "top",
  });

  // hairline divider
  const divY = y + 18;
  pdf.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
  pdf.setLineWidth(0.2);
  pdf.line(x + pad, divY, x + LABEL_W - pad, divY);

  // --- Work order ---
  eyebrow("Work Order", divY + 2.5);
  setInk("bold", 18, INK);
  const woText = label.wo ? "WO " + label.wo : "WO ————";
  pdf.text(woText, x + pad, divY + 6, { baseline: "top" });

  // --- Task description ---
  eyebrow("Task", divY + 14);
  setInk("bold", 10.5, INK);
  const taskLines = pdf.splitTextToSize(
    (label.task || "").toUpperCase(),
    innerW,
  );
  let ty = divY + 17.5;
  // cap at 2 lines so a long task never overruns the frame
  for (const line of taskLines.slice(0, 2)) {
    pdf.text(line, x + pad, ty, { baseline: "top" });
    ty += 4.8;
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
