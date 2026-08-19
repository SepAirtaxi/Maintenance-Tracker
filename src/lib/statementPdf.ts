import { jsPDF } from "jspdf";
import logoUrl from "@/img/logo.png";

// Display strings for the statement document. These are the already-formatted
// values that get drawn into the PDF (mirrors the prototype's DOM textContent).
export interface StatementDoc {
  reg: string; // e.g. "OY-CAT"
  ttaf: string; // formatted TTAF or "—"
  ldgs: string; // formatted landings or "—"
  printed: string; // printed date, formatted
  dueH: string; // hours due or "—"
  dueD: string; // calendar due or "—"
  dueC: string; // cycles due or "—"
  wo: string; // "1234" or "XXXX"
  note: string; // raw note text (may be empty)
}

// Fixed maintenance-organisation legal block. 1-to-1 with the original template.
const LEGAL_LINES = [
  "SHOP APPROVAL: DK.CAMO.0021",
  "Hangarvej B 2",
  "Roskilde Airport",
  "DK-4000 Roskilde",
  "Ph. Office: +45 46191114",
  "CAMO@AIRCAT.DK",
];

let logoPromise: Promise<HTMLImageElement> | null = null;
function loadLogo(): Promise<HTMLImageElement> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = logoUrl;
    });
  }
  return logoPromise;
}

// Draws the Temporary Maintenance Statement onto a fresh A4 and triggers a
// download. The document layout is a faithful port of the approved standalone
// generator — only the surrounding app UI was redesigned, not this output.
export async function buildStatementPdf(doc: StatementDoc): Promise<void> {
  const logo = await loadLogo();
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });

  const M = 14; // page margin
  const R = 196; // right edge
  const CW = R - M; // content width
  const SPLIT = M + CW * 0.42; // column divider
  const PAD = 3.5; // cell padding
  const CX = M + CW / 2; // page centre

  const DARK: [number, number, number] = [26, 26, 26];
  const GRAY: [number, number, number] = [128, 128, 128];
  const LABEL: [number, number, number] = [85, 85, 85];
  const LEGAL: [number, number, number] = [51, 51, 51];
  const RED: [number, number, number] = [212, 0, 0];

  const F = (style: string, size: number, color: [number, number, number]) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };

  // word-level layout so the bold WO number can sit inside a wrapped, centred paragraph
  type RichSeg = { text: string; bold: boolean };
  type RichWord = { w: string; bold: boolean; width: number };
  type RichLine = { items: RichWord[]; width: number };
  function layoutRich(segs: RichSeg[], maxW: number, size: number) {
    const words: RichWord[] = [];
    for (const s of segs)
      for (const w of s.text.split(/\s+/))
        if (w) words.push({ w, bold: s.bold, width: 0 });
    pdf.setFontSize(size);
    pdf.setFont("helvetica", "normal");
    const sp = pdf.getTextWidth(" ");
    const lines: RichLine[] = [];
    let line: RichWord[] = [];
    let lw = 0;
    for (const it of words) {
      pdf.setFont("helvetica", it.bold ? "bold" : "normal");
      it.width = pdf.getTextWidth(it.w);
      if (line.length && lw + sp + it.width > maxW) {
        lines.push({ items: line, width: lw });
        line = [];
        lw = 0;
      }
      lw += line.length ? sp + it.width : it.width;
      line.push(it);
    }
    if (line.length) lines.push({ items: line, width: lw });
    return { lines, spaceW: sp };
  }
  function drawRich(
    rich: { lines: RichLine[]; spaceW: number },
    cx: number,
    y: number,
    lh: number,
    size: number,
    color: [number, number, number],
  ) {
    for (const ln of rich.lines) {
      let x = cx - ln.width / 2;
      for (const it of ln.items) {
        F(it.bold ? "bold" : "normal", size, color);
        pdf.text(it.w, x, y, { baseline: "top" });
        x += it.width + rich.spaceW;
      }
      y += lh;
    }
    return y;
  }

  // ---- measure variable rows ----
  F("normal", 9.5, DARK);
  const noteLines = doc.note.trim()
    ? pdf.splitTextToSize(doc.note, CW - 2 * PAD)
    : [];
  const bodySegs: RichSeg[] = [
    {
      text: "This Maintenance Statement is only valid if all tasks are completed on Work order no.",
      bold: false,
    },
    { text: doc.wo, bold: true },
    {
      text: "and all deferred items have been accepted by CAT CAMO. If the Temp Maintenance Statement has been used in connection with the release, it must be included in the work package sent to the CAMO.",
      bold: false,
    },
  ];
  const bodyLines = layoutRich(bodySegs, 152, 9.5);
  F("bold", 9.5, RED);
  const redLines = pdf.splitTextToSize(
    "Mentioned work order has been released in the journey logbook or on tech no.:",
    152,
  );

  const H1 = 36,
    H2 = 11,
    H3 = 37;
  const H4 = Math.max(24, PAD + 7 + noteLines.length * 5.2 + PAD);
  const H5 =
    PAD +
    1 +
    5.2 +
    2.5 +
    bodyLines.lines.length * 5.4 +
    2.8 +
    redLines.length * 5.4 +
    12 +
    5;

  const y1 = 14,
    y2 = y1 + H1,
    y3 = y2 + H2,
    y4 = y3 + H3,
    y5 = y4 + H4;
  const yEnd = y5 + H5;

  // ---- borders ----
  pdf.setDrawColor(153, 153, 153);
  pdf.setLineWidth(0.21);
  pdf.line(M, y2, R, y2);
  pdf.line(M, y3, R, y3);
  pdf.line(M, y4, R, y4);
  pdf.line(M, y5, R, y5);
  pdf.line(SPLIT, y1, SPLIT, y2);
  pdf.line(SPLIT, y3, SPLIT, y4);
  pdf.setDrawColor(26, 26, 26);
  pdf.setLineWidth(0.53);
  pdf.rect(M, y1, CW, yEnd - y1);

  // ---- row 1: logo + legal ----
  const logoW = 62;
  const logoH = (logoW * logo.naturalHeight) / logo.naturalWidth;
  pdf.addImage(
    logo,
    "PNG",
    M + (SPLIT - M - logoW) / 2,
    y1 + (H1 - logoH) / 2,
    logoW,
    logoH,
  );

  let ly = y1 + (H1 - LEGAL_LINES.length * 4.8) / 2 + 0.5;
  LEGAL_LINES.forEach((line, i) => {
    F(i === 0 ? "bold" : "normal", 8.5, i === 0 ? DARK : LEGAL);
    pdf.text(line, R - PAD, ly, { align: "right", baseline: "top" });
    ly += 4.8;
  });

  // ---- row 2: title ----
  F("bold", 12, RED);
  pdf.text(
    "CAMO Maintenance Statement: " + doc.reg + " Temporary Version",
    CX,
    y2 + H2 / 2,
    { align: "center", baseline: "middle" },
  );

  // ---- row 3 left: aircraft data ----
  F("bold", 10.5, GRAY);
  pdf.text("Aircraft Data", M + (SPLIT - M) / 2, y3 + PAD, {
    align: "center",
    baseline: "top",
  });
  let ky = y3 + PAD + 7.5;
  for (const [k, v] of [
    ["TTAF", doc.ttaf],
    ["Landings", doc.ldgs],
    ["Printed Date", doc.printed],
  ]) {
    F("normal", 9.5, LABEL);
    pdf.text(k, M + PAD, ky, { baseline: "top" });
    F("bold", 9.5, DARK);
    pdf.text(v, M + PAD + 30, ky, { baseline: "top" });
    ky += 6.2;
  }

  // ---- row 3 right: next due ----
  const nx = SPLIT + PAD;
  F("bold", 10.5, GRAY);
  pdf.text("Next Due", SPLIT + (R - SPLIT) / 2, y3 + PAD, {
    align: "center",
    baseline: "top",
  });
  const cType = nx + 20,
    cDesc = nx + 47,
    cDue = nx + 77;
  let ny = y3 + PAD + 7.5;
  F("bold", 9.5, DARK);
  pdf.text("Type", cType, ny, { baseline: "top" });
  pdf.text("Description", cDesc, ny, { baseline: "top" });
  pdf.text("Due", cDue, ny, { baseline: "top" });
  pdf.setDrawColor(187, 187, 187);
  pdf.setLineWidth(0.21);
  pdf.line(nx, ny + 4.6, R - PAD, ny + 4.6);
  ny += 6.6;
  for (const r of [
    ["Hours", "Inspection", "TEMP", doc.dueH],
    ["Calendar", "Component", "TEMP", doc.dueD],
    ["Cycles", "AD/SB", "TEMP", doc.dueC],
  ]) {
    F("normal", 9.5, DARK);
    pdf.text(r[0], nx, ny, { baseline: "top" });
    pdf.text(r[1], cType, ny, { baseline: "top" });
    pdf.text(r[2], cDesc, ny, { baseline: "top" });
    F("bold", 9.5, DARK);
    pdf.text(r[3], cDue, ny, { baseline: "top" });
    ny += 6.2;
  }

  // ---- row 4: note ----
  F("bold", 10.5, GRAY);
  pdf.text("Note", CX, y4 + PAD, { align: "center", baseline: "top" });
  let noy = y4 + PAD + 7;
  F("normal", 9.5, DARK);
  for (const line of noteLines) {
    pdf.text(line, M + PAD, noy, { baseline: "top" });
    noy += 5.2;
  }

  // ---- row 5: release ----
  let ry = y5 + PAD + 1;
  F("bold", 10.5, DARK);
  pdf.text("This is only a temporary maintenance statement.", CX, ry, {
    align: "center",
    baseline: "top",
  });
  ry += 5.2 + 2.5;
  ry = drawRich(bodyLines, CX, ry, 5.4, 9.5, DARK);
  ry += 2.8;
  F("bold", 9.5, RED);
  for (const line of redLines) {
    pdf.text(line, CX, ry, { align: "center", baseline: "top" });
    ry += 5.4;
  }
  ry += 12;
  pdf.setDrawColor(26, 26, 26);
  pdf.setLineWidth(0.35);
  pdf.line(CX - 55, ry, CX + 55, ry);

  const reg = doc.reg.trim() || "TMS";
  pdf.save("TEMP MS " + reg + " " + new Date().toISOString().slice(0, 10) + ".pdf");
}
