# AsymptoteConvert

Convert an Excalidraw drawing to Asymptote without leaving the browser. The app is
static, has no build step, and is useful for putting editable Asymptote code in an
AoPS post instead of embedding a PNG.

## Features

- Converts rectangles, ellipses, lines, arrows, freehand strokes, and text.
- Keeps the source JSON in a separate, pure parser/converter module.
- Shows a responsive canvas preview with the same normalized geometry used for code generation.
- Produces selectable Asymptote code with a **Copy code** action.
- Shows a timestamped activity log with success, warning, and error states.
- Supports per-panel expand/collapse controls plus **Expand all** and **Collapse all**.
- Includes a sample drawing so the interface can be tried immediately.
- Handles malformed JSON and unsupported elements without losing the rest of a drawing.

## Run locally

The page uses native ES modules. Serve the directory over HTTP rather than opening
`index.html` directly:

```sh
python3 -m http.server 8000
```

Then visit <http://localhost:8000/>. A hosted copy can be published with GitHub Pages.

## Development

- `parser.js` is the DOM-free parsing and code-generation layer. It returns normalized
  elements and structured diagnostics, and never writes to the browser console.
- `renderer.js` is the canvas-only preview layer.
- `script.js` owns DOM wiring, status updates, logging, clipboard actions, and panel controls.
- `sample-data.js` contains the example document.
- `styles.css` contains the responsive interface styles.

Run the test suite with:

```sh
npm test
```

The project uses only browser-native JavaScript and Node's built-in test runner; there
are no runtime dependencies.

## Current limitations

Rounded rectangle corners are currently exported as sharp corners and are reported in
the conversion log. Fill colors and solid/dashed strokes are supported; other Excalidraw
fill styles are not modeled yet. Other element types are skipped with a clear warning
until dedicated converters are added.
