#!/usr/bin/env python3
"""Generate Session 7 summary PDF from current index.html."""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
INDEX = ROOT / "index.html"
HTML_OUT = ROOT / "downloads" / "session-7-summary.html"
PDF_OUT = ROOT / "downloads" / "session-7-summary.pdf"

CHROME_PATHS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
]

STYLE = """
<style>
  @page { size: letter portrait; margin: 0.65in 0.7in; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    max-width: 7.1in;
    margin: 0 auto;
    padding: 0.35in 0;
    color: #111;
    line-height: 1.65;
    font-size: 15pt;
  }
  h1 {
    font-family: Arial, Helvetica, sans-serif;
    color: #1e4d8c;
    font-size: 24pt;
    font-weight: 700;
    margin: 0 0 0.35rem;
    line-height: 1.2;
  }
  .meta {
    font-family: Arial, Helvetica, sans-serif;
    color: #444;
    font-size: 13pt;
    margin-bottom: 1.1rem;
    line-height: 1.5;
  }
  h2 {
    font-family: Arial, Helvetica, sans-serif;
    color: #1e4d8c;
    font-size: 17pt;
    margin: 1.35rem 0 0.55rem;
    page-break-after: avoid;
  }
  h3 {
    font-family: Arial, Helvetica, sans-serif;
    color: #1e4d8c;
    font-size: 15pt;
    margin: 1.1rem 0 0.45rem;
    page-break-after: avoid;
  }
  .owner-block h3 {
    font-size: 14pt;
    margin-top: 1rem;
  }
  p { margin: 0.45rem 0; }
  ul { margin: 0.4rem 0 0.85rem 1.35rem; padding: 0; }
  li { margin-bottom: 0.35rem; }
  .callout {
    background: #e8f0fa;
    border-left: 4px solid #1e4d8c;
    padding: 0.75rem 0.95rem;
    margin: 0.85rem 0 1.1rem;
    font-size: 14pt;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.55rem 0 0.95rem;
    font-size: 13pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #bbb;
    padding: 0.45rem 0.55rem;
    text-align: left;
    vertical-align: top;
  }
  th { background: #eef1f6; font-weight: 700; }
  .owner-block { margin: 0.85rem 0 1.1rem; page-break-inside: avoid; }
  .footer {
    margin-top: 1.5rem;
    padding-top: 0.65rem;
    border-top: 1px solid #ccc;
    font-size: 11pt;
    color: #666;
  }
</style>
"""


def extract_section(html: str, section_id: str) -> str:
    pattern = rf'<section id="{re.escape(section_id)}"[^>]*>(.*?)</section>'
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        raise ValueError(f"Section #{section_id} not found")
    return match.group(1).strip()


def clean(fragment: str) -> str:
    fragment = re.sub(r'\sclass="[^"]*"', "", fragment)
    fragment = re.sub(r'\sstyle="[^"]*"', "", fragment)
    fragment = re.sub(r'<p class="panel-label">.*?</p>\s*', "", fragment, flags=re.DOTALL)
    return fragment


def find_chrome() -> str:
    for path in CHROME_PATHS:
        if Path(path).exists():
            return path
    raise FileNotFoundError("Chrome/Chromium not found for PDF generation")


def html_to_pdf(html_path: Path, pdf_path: Path) -> None:
    chrome = find_chrome()
    file_url = html_path.resolve().as_uri()
    subprocess.run(
        [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path.resolve()}",
            file_url,
        ],
        check=True,
        capture_output=True,
    )


def main() -> None:
    html = INDEX.read_text(encoding="utf-8")
    notes = clean(extract_section(html, "session7-notes"))
    actions = clean(extract_section(html, "session7-actions"))
    body = notes + "\n" + actions

    doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Arkay Session 7 Summary Meeting Notes</title>
  {STYLE}
</head>
<body>
  <h1>Session 7 Summary Meeting Notes</h1>
  <p class="meta"><strong>Date:</strong> Monday, June 23, 2026 · 10:00 AM – 2:00 PM<br>
  <strong>Location:</strong> Southampton · Mitchell's house<br>
  <strong>Confidential</strong> · Arkay Succession Planning</p>
  {body}
  <p class="footer">Arkay Packaging · Succession Planning · Session 7 · Confidential</p>
</body>
</html>
"""
    HTML_OUT.parent.mkdir(exist_ok=True)
    HTML_OUT.write_text(doc, encoding="utf-8")
    html_to_pdf(HTML_OUT, PDF_OUT)
    print(f"Wrote {PDF_OUT}")


if __name__ == "__main__":
    main()
