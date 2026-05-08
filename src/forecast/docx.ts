import JSZip from "jszip";

export type DocxCell = { text: string };
export type DocxRow = { cells: DocxCell[] };
export type DocxTable = { rows: DocxRow[] };

export type DocxParse = {
  tables: DocxTable[];
  pageHeaderText: string;
};

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function localChildren(parent: Element, name: string): Element[] {
  const out: Element[] = [];
  for (const child of Array.from(parent.children)) {
    if (child.localName === name) out.push(child);
  }
  return out;
}

// All <w:tbl> descendants including nested. Mirrors python-docx's behavior of
// exposing nested tables when iterated explicitly.
function allTables(root: Element | Document): Element[] {
  return Array.from(root.getElementsByTagNameNS(W_NS, "tbl"));
}

// Cell text: paragraphs joined with "\n", runs joined with "" within a paragraph.
// Tabs become spaces; <w:br/> becomes a newline.
function cellText(tc: Element): string {
  const paragraphs = localChildren(tc, "p");
  const lines: string[] = [];
  for (const p of paragraphs) {
    let line = "";
    const runs = p.getElementsByTagNameNS(W_NS, "r");
    for (const r of Array.from(runs)) {
      // Skip runs that live inside a nested table cell — they belong to the
      // inner table, not this one. We walk the parent chain because namespaced
      // selectors via Element.closest() are unreliable across DOM impls.
      let belongs = true;
      let parent: Element | null = r.parentElement;
      while (parent && parent !== tc) {
        if (parent.localName === "tc") {
          belongs = false;
          break;
        }
        parent = parent.parentElement;
      }
      if (!belongs) continue;
      for (const node of Array.from(r.childNodes)) {
        if (node.nodeType !== 1) continue;
        const el = node as Element;
        if (el.localName === "t") {
          line += el.textContent ?? "";
        } else if (el.localName === "tab") {
          line += "\t";
        } else if (el.localName === "br") {
          line += "\n";
        }
      }
    }
    lines.push(line);
  }
  return lines.join("\n").trim();
}

// gridSpan duplicates the cell N times so column indexes line up with the
// table's grid. python-docx does the same — section header rows in our docx
// have gridSpan=N and surface as N identical cells.
function readGridSpan(tc: Element): number {
  const tcPr = localChildren(tc, "tcPr")[0];
  if (!tcPr) return 1;
  const gs = localChildren(tcPr, "gridSpan")[0];
  if (!gs) return 1;
  const v = gs.getAttributeNS(W_NS, "val") ?? gs.getAttribute("w:val");
  const n = v ? parseInt(v, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseTable(tbl: Element): DocxTable {
  const rows: DocxRow[] = [];
  for (const tr of localChildren(tbl, "tr")) {
    const cells: DocxCell[] = [];
    for (const tc of localChildren(tr, "tc")) {
      const text = cellText(tc);
      const span = readGridSpan(tc);
      for (let i = 0; i < span; i++) cells.push({ text });
    }
    rows.push({ cells });
  }
  return { rows };
}

function readDocumentXml(xml: string): DocxTable[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  // Top-level <w:tbl> only — nested tables are reached separately by walking
  // table cells. Mirrors python-docx's `Document.tables`.
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) return [];

  const out: DocxTable[] = [];
  const visit = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (child.localName === "tbl") {
        out.push(parseTable(child));
        // Recurse into nested tables (python-docx exposes them via cell.tables)
        for (const innerTbl of allTables(child)) {
          if (innerTbl !== child) out.push(parseTable(innerTbl));
        }
      }
    }
  };
  visit(body);
  return out;
}

function readHeadersText(xmls: string[]): string {
  const lines: string[] = [];
  for (const xml of xmls) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const ts = doc.getElementsByTagNameNS(W_NS, "t");
    let buf = "";
    for (const t of Array.from(ts)) buf += (t.textContent ?? "") + " ";
    const trimmed = buf.trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines.join("\n");
}

export async function parseDocx(input: ArrayBuffer | Blob): Promise<DocxParse> {
  const zip = await JSZip.loadAsync(input);

  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) throw new Error("Not a valid .docx (missing word/document.xml).");
  const docXml = await docXmlFile.async("string");
  const tables = readDocumentXml(docXml);

  const headerXmls: string[] = [];
  for (const name of Object.keys(zip.files)) {
    if (/^word\/header\d*\.xml$/.test(name)) {
      headerXmls.push(await zip.files[name].async("string"));
    }
  }
  const pageHeaderText = readHeadersText(headerXmls);

  return { tables, pageHeaderText };
}
