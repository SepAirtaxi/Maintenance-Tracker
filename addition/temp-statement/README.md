# Temporary Maintenance Statement Generator — v1.0

A single-file browser app for issuing Temporary Maintenance Statements (TMS) at
Copenhagen AirTaxi CAMO. Replaces the old Word template (`TEMP MS Skabelon.docx`,
kept in this folder for reference).

## Usage

Open `index.html` in a browser (double-click — no install or server needed).
Fill in the form on the left; the A4 preview on the right updates live.

| Field | Behaviour |
|---|---|
| Registration | Free text, auto-uppercased (default OY-CAT) |
| TTAF / Landings | Aircraft values at time of entry |
| Hours toggle | On = due at TTAF +25 h; off = enter custom hours to add |
| Calendar toggle | On = due at today +30 days; off = pick an exact date |
| Cycles toggle | On = due at landings +100; off = enter custom landings to add |
| Work order no. | 4-digit integer; shows as XXXX until 4 digits are entered |
| Note | Optional free text |

Printed date is always today, set automatically. All entries are remembered
between sessions (browser localStorage).

**Download PDF** generates the statement client-side (jsPDF) and saves it
directly, e.g. `TEMP MS OY-CAT 2026-07-10.pdf`. If the browser still asks for a
location, disable "Ask where to save each file before downloading" in the
browser's download settings. The "open the print dialog" link prints the
preview directly instead.

## Maintenance notes

- **The document exists twice in `index.html`**: once as HTML/CSS (the live
  preview, also used by the print dialog) and once as drawing code in the
  `buildPdf()` function (the downloaded PDF). Any change to wording, layout or
  the fixed legal details must be made in **both** places or the preview and
  the download will diverge.
- The logo is embedded in `index.html` as a base64 data URI, so the file is
  fully portable. To update the logo, re-encode the new PNG to base64 and
  replace the `img src` value, and update the width/height ratio in
  `buildPdf()` (`logoW * height / width`).
- Internet is only needed for cosmetics and the download button: UI fonts
  (Google Fonts) and jsPDF load from CDNs. Offline, the app still works — the
  Download button falls back to the print dialog (Save as PDF).
- **Windows PowerShell 5.1 pitfall**: the file is UTF-8 without BOM. Editing it
  with `Get-Content`/`Set-Content` (default ANSI decoding) corrupts the em-dash
  characters. Use an editor, or read/write with explicit UTF-8 encoding.

## History

- **v1.0 (2026-07-10)** — initial release. Modernized layout agreed after
  iteration: standard Arial, red bold title on white, centered gray section
  titles, hairline borders in a solid outer frame, centered release block with
  a 110 mm hand-fill signature line, no fax number. Output verified against
  the original template's structure.
