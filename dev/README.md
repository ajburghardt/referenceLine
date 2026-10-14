# Developer tools (not deployed)

Run a local server from the repository root first:

```bash
python3 -m http.server 8765
```

Each tool must be copied next to the app pages to run (same origin), then removed. Never deploy files starting with `_`.

## selftest.html: cross-browser functional test

Exercises the landing page, Training, Evaluation, Reproducibility, and the certificate (12 checks):

```bash
cp dev/selftest.html _selftest.html
```

Open `http://localhost:8765/_selftest.html` in each browser and read the results on the page. Then delete `_selftest.html`.

## printharness.html: one-page print check

Runs a full session in a module, then turns the page into its print-ready version so a headless browser can save it as PDF. Each module should print as exactly 1 page:

```bash
cp dev/printharness.html _printharness.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --virtual-time-budget=60000 --print-to-pdf=out.pdf \
  "http://localhost:8765/_printharness.html?m=training"
```

Use `m=evaluation` or `m=repro` for the other modules; add `&a4=1` for A4 paper. Then delete `_printharness.html`.

## wkprint.swift: print through WebKit (macOS)

Prints a page with WebKit, Safari's engine and print path, to PDF, optionally running JavaScript first. This matters because Safari prints differently from Chrome:

```bash
swiftc -O dev/wkprint.swift -o /tmp/wkprint
/tmp/wkprint "http://localhost:8765/certificate.html?bone=tibia" out.pdf
```

Known Safari pitfalls these tools caught:
- An `@page` margin rule makes Safari 27 print blank pages.
- Images inside `display:none` content aren't decoded in time for printing.
