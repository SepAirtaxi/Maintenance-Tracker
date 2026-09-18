// PDF → positioned text runs.
//
// The only file in this module that knows about pdfjs, so the parsing logic
// stays testable without a PDF engine.

import type { TextItem } from "./types";

// pdfjs and its worker are a little over a megabyte together, and nothing needs
// them until someone actually uploads a report — so they are pulled in on the
// first call rather than bundled into the app's main chunk.
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerSrc } = await import(
    "pdfjs-dist/build/pdf.worker.min.mjs?url"
  );
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
}

export async function extractTextItems(
  input: ArrayBuffer | Blob,
): Promise<TextItem[]> {
  const pdfjs = await loadPdfjs();
  const data =
    input instanceof Blob
      ? new Uint8Array(await input.arrayBuffer())
      : new Uint8Array(input);

  const doc = await pdfjs.getDocument({ data }).promise;
  const items: TextItem[] = [];

  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const height = page.getViewport({ scale: 1 }).height;
      const content = await page.getTextContent();

      for (const item of content.items) {
        if (!("str" in item)) continue; // marked-content markers
        const text = item.str.trim();
        if (!text) continue;
        // transform is [a, b, c, d, e, f]; e/f are the run's origin in PDF
        // space, which counts up from the bottom of the page. Flip it so rows
        // sort the way the page reads.
        const [, , , , x, y] = item.transform as number[];
        items.push({ text, x, top: height - y, page: pageNo });
      }
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return items;
}
