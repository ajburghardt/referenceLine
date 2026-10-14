# Reference Line – Training & Evaluation

Web application at: [https://webapps.radiology.ucsf.edu/refline/](https://webapps.radiology.ucsf.edu/refline/)

Web application to train and evaluate high-resolution peripheral quantitative computed tomography (HR-pQCT) operators in positioning the reference line on scout view images, to acquire standardized images. It simulates the acquisition software of the XtremeCT system (Scanco Medical AG).

The code is plain HTML, CSS, and JavaScript, with no frameworks or build step.

## Modules

| Module | Purpose |
|---|---|
| **Training** (`reflineTraining.html`) | Practice on 8-image sets, with feedback after every image. Includes the 15-set "For certification" sequence. |
| **Evaluation** (`reflineEvaluation.html`) | Certification. Pass 3 sets per bone and landmark definition. A set passes only if all 8 positions are Exact or Good. |
| **Reproducibility** (`reflineRepro.html`) | Short-term intra-operator reproducibility: 15 radius or 16 tibia images, each shown 3 times, scored as the RMS of standard deviations. |

Radius sets can be scored against the Scanco landmark or the proximal margin landmark.

## Files

| Path | Contents |
|---|---|
| `landingpage.html` | Home page: modules, About, Documentation, Contact. `index.html` is a symlink to it. |
| `reflineTraining.html`, `reflineEvaluation.html`, `reflineRepro.html` | Module pages (`<body data-mode=…>`) |
| `refline.js` | Shared engine for all three modules: positioning, scoring, feedback, printing |
| `refline.css` | All styles (UCSF brand colors, print layout) |
| `radiusjSON.js`, `tibiajSON.js` | Image list, ground truth, image sets, and pixel-row → mm tables |
| `inputData/` | Scout view images (512 × 512) |
| `img/` | Logo, figures, and icons |
| `certificate.html` | Printable certification page |
| `coverpage.html` | Redirect from the old module launcher URL |
| `dev/` | Test tools; not deployed. See [dev/README.md](dev/README.md). |

## Requirements

- **Device:** a desktop or laptop with a mouse or trackpad. Phones and tablets are blocked, as on the scanner workstation.
- **Browser:** current Chrome, Edge, Firefox, or Safari (Chrome/Edge 88+, Firefox 98+, Safari 15.4+). Older browsers see an "unsupported browser" notice.
- **Input:** the line is positioned with the mouse. Keyboard positioning (arrow keys, then Enter) is available for accessibility. In Evaluation and Reproducibility, keyboard-placed lines are flagged and do not count toward certification or the score.

## Deployment

Copy the repository contents (excluding `dev/`, `.git/`, and any `_*.html` test files) to the web server directory. Keep the `index.html → landingpage.html` symlink, or rename `landingpage.html` to `index.html` and update links. No server-side code is needed.

## Accessibility

Designed to meet WCAG 2.1 Level A and AA, and verified with axe-core (0 violations). Features include:
- skip link, landmarks, and headings
- text alternatives for all figures
- visible keyboard focus
- AA color contrast
- an accessible results dialog with tables
- a live-region status for screen readers

## Citation

If you use this application to train operators in your study, please cite:

Bonaretti S, Vilayphiou N, Chan CM, Yu A, Nishiyama K, Liu D, Boutroy S, Ghasem-Zadeh A, Boyd SK, Chapurlat R, McKay H, Shane E, Bouxsein ML, Black DM, Majumdar S, Orwoll ES, Lang TF, Khosla S, Burghardt AJ. Operator variability in scan positioning is a major component of HR-pQCT precision error and is reduced by standardized training. *Osteoporosis International*. 2017;28(1):245–257. [doi:10.1007/s00198-016-3705-5](https://doi.org/10.1007/s00198-016-3705-5)

## Credits

Original code developer: [Caroline Mai Chan](https://www.csail.mit.edu/person/caroline-chan)
Supervisors: [Serena Bonaretti](https://sbonaretti.github.io/) and [Andrew Burghardt](https://profiles.ucsf.edu/andrew.burghardt)

Forked from [sbonaretti/referenceLine](https://github.com/sbonaretti/referenceLine).

## Modification notice

This is a modified version of the original work (GPL-3.0, section 5a). **Modified October 2026** by Andrew Burghardt (UCSF):
- Accessibility remediation to WCAG 2.1 A/AA and alignment with UCSF brand standards.
- Rewrite of the three module scripts into one shared engine, with no jQuery or Bootstrap. Scoring is unchanged.
- Fixes:
  - Training category selection
  - Evaluation landmark assignment
  - layout-dependent line coordinates
  - per-landmark pass counts
  - Safari printing
- Added mouse-only positioning, keyboard flagging in assessments, one-page printable results, and cross-browser test tools.

## License

[GNU General Public License v3.0](LICENSE)
