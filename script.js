import { convertExcalidraw, ExcalidrawParseError } from "./parser.js";
import { CanvasRenderer } from "./renderer.js";
import { SAMPLE_DATA } from "./sample-data.js";

const byId = (id) => document.getElementById(id);

const ui = {
    source: byId("source-input"),
    sourceState: byId("source-state"),
    sourceCount: byId("source-count"),
    sourceHint: byId("source-hint"),
    convert: byId("convert-button"),
    clearSource: byId("clear-source"),
    loadSample: byId("load-sample"),
    copy: byId("copy-code"),
    clearLogs: byId("clear-logs"),
    expandAll: byId("expand-all"),
    collapseAll: byId("collapse-all"),
    canvas: byId("preview-canvas"),
    canvasEmpty: byId("canvas-empty"),
    previewPill: byId("preview-pill"),
    outputCode: byId("output-code"),
    outputMeta: byId("output-meta"),
    logList: byId("log-list"),
    logEmpty: byId("log-empty"),
    logCount: byId("log-count"),
    shortcut: byId("shortcut-hint"),
};

const state = {
    lastResult: null,
    logs: [],
    logSequence: 0,
    resizeTimer: null,
};

let renderer;
try {
    renderer = new CanvasRenderer(ui.canvas);
} catch (error) {
    // The parser and output remain useful even when canvas support is missing.
    setStatus("error", "Preview unavailable");
    setPreviewPill("Canvas unavailable", "error");
    addLog(
        "error",
        "The browser could not create a 2D canvas context.",
        error.message,
    );
}

function setStatus(status, message) {
    ui.sourceState.className = `input-state is-${status}`;
    ui.sourceState.replaceChildren(
        Object.assign(document.createElement("span"), {
            className: "state-dot",
        }),
        document.createTextNode(message),
    );
}

function setPreviewPill(message, status = "") {
    ui.previewPill.textContent = message;
    ui.previewPill.className = `result-pill${status ? ` is-${status}` : ""}`;
}

function setOutputMeta(message) {
    ui.outputMeta.textContent = message;
}

function formatCharacterCount(value) {
    return `${value.toLocaleString()} character${value === 1 ? "" : "s"}`;
}

function formatLineCount(value) {
    return `${value} line${value === 1 ? "" : "s"}`;
}

function formatTime(date) {
    return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(date);
}

function renderLogs() {
    ui.logList.replaceChildren();
    ui.logCount.textContent = `${state.logs.length} event${state.logs.length === 1 ? "" : "s"}`;

    if (!state.logs.length) {
        ui.logEmpty.hidden = false;
        return;
    }

    ui.logEmpty.hidden = true;
    for (const entry of state.logs) {
        const details = document.createElement("details");
        details.className = "log-entry";
        details.dataset.level = entry.level;

        const summary = document.createElement("summary");
        const dot = document.createElement("span");
        dot.className = "log-dot";
        dot.setAttribute("aria-hidden", "true");
        const message = document.createElement("span");
        message.className = "log-message";
        message.textContent = entry.message;
        const time = document.createElement("time");
        time.className = "log-time";
        time.dateTime = entry.timestamp.toISOString();
        time.textContent = formatTime(entry.timestamp);
        summary.append(dot, message, time);

        if (entry.detail) {
            const detail = document.createElement("p");
            detail.className = "log-detail";
            detail.textContent = entry.detail;
            details.append(summary, detail);
        } else {
            details.append(summary);
        }
        ui.logList.append(details);
    }
}

function addLog(level, message, detail = "") {
    state.logSequence += 1;
    state.logs.push({
        id: state.logSequence,
        level,
        message,
        detail,
        timestamp: new Date(),
    });
    renderLogs();
}

function clearLogs() {
    state.logs = [];
    renderLogs();
}

function updateSourceCount() {
    ui.sourceCount.textContent = formatCharacterCount(ui.source.value.length);
}

function markSourceDirty() {
    state.lastResult = null;
    setStatus("dirty", "Input changed");
    setPreviewPill("Input changed", "warning");
    ui.copy.disabled = true;
    setOutputMeta("Convert again to refresh the output");
    updateSourceCount();
}

function diagnosticDetail(diagnostic) {
    const location =
        diagnostic.elementIndex === null ||
        diagnostic.elementIndex === undefined
            ? ""
            : `Element #${diagnostic.elementIndex + 1}`;
    return [location, diagnostic.code, diagnostic.elementId]
        .filter(Boolean)
        .join(" · ");
}

function rootErrorMessage(error) {
    if (error instanceof ExcalidrawParseError) return error.message;
    return error?.message || "The drawing could not be converted.";
}

function renderPreview(elements) {
    if (!renderer) return false;
    try {
        renderer.render(elements);
        return true;
    } catch (error) {
        setPreviewPill("Preview error", "error");
        addLog(
            "error",
            "The preview could not be rendered.",
            error?.message || "The code was still generated.",
        );
        return false;
    }
}

function clearConversionOutput() {
    state.lastResult = null;
    ui.outputCode.textContent =
        "Convert a drawing to see the Asymptote output.";
    ui.copy.disabled = true;
    setOutputMeta("No code generated yet");
    ui.canvasEmpty.classList.remove("is-hidden");
    if (renderPreview([]) !== false) setPreviewPill("Waiting for data");
}

function convertDrawing() {
    const source = ui.source.value.trim();
    if (!source) {
        clearConversionOutput();
        setStatus("error", "Paste JSON first");
        setPreviewPill("No source", "error");
        addLog("warning", "Nothing to convert because the source is empty.");
        return;
    }

    try {
        const result = convertExcalidraw(source);
        state.lastResult = result;
        ui.outputCode.textContent = result.code;
        ui.copy.disabled = false;
        setOutputMeta(
            `${formatLineCount(result.lineCount)} · ${result.stats.converted} element${result.stats.converted === 1 ? "" : "s"} converted`,
        );
        const hasWarnings =
            result.stats.warnings > 0 || result.stats.errors > 0;
        setStatus(
            result.stats.errors ? "error" : hasWarnings ? "warning" : "success",
            hasWarnings ? "Converted with warnings" : "Converted successfully",
        );
        ui.canvasEmpty.classList.toggle(
            "is-hidden",
            result.elements.length > 0,
        );

        const previewRendered = renderPreview(result.elements);
        const skipped = result.stats.skipped;
        if (previewRendered) {
            setPreviewPill(
                `${result.stats.converted} element${result.stats.converted === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped` : ""}`,
                skipped || result.stats.warnings ? "warning" : "success",
            );
        }

        addLog(
            hasWarnings ? "warning" : "success",
            `Converted ${result.stats.converted} of ${result.stats.total} element${result.stats.total === 1 ? "" : "s"}.`,
            `${formatLineCount(result.lineCount)} of Asymptote generated.${skipped ? ` ${skipped} unsupported or invalid element${skipped === 1 ? "" : "s"} skipped.` : ""}`,
        );
        for (const diagnostic of result.diagnostics) {
            addLog(
                diagnostic.level,
                diagnostic.message,
                diagnosticDetail(diagnostic),
            );
        }
    } catch (error) {
        clearConversionOutput();
        setStatus("error", "Could not parse source");
        setPreviewPill("Parse error", "error");
        addLog(
            "error",
            rootErrorMessage(error),
            error instanceof ExcalidrawParseError
                ? 'Check the JSON syntax and the "elements" array.'
                : "The converter stopped before producing output.",
        );
    }
}

async function copyCode() {
    const result = state.lastResult;
    if (!result?.code) return;

    let copied = false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(result.code);
            copied = true;
        } else {
            throw new Error("Clipboard API unavailable");
        }
    } catch {
        const helper = document.createElement("textarea");
        helper.value = result.code;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.append(helper);
        helper.select();
        try {
            copied = document.execCommand("copy");
        } catch {
            copied = false;
        }
        helper.remove();
    }

    if (copied) {
        addLog(
            "success",
            "Asymptote code copied to the clipboard.",
            `${formatLineCount(result.lineCount)} copied.`,
        );
        ui.copy.classList.add("is-copied");
        ui.copy.querySelector("span:last-child").textContent = "Copied";
        window.setTimeout(() => {
            ui.copy.classList.remove("is-copied");
            ui.copy.querySelector("span:last-child").textContent = "Copy code";
        }, 1600);
    } else {
        addLog(
            "error",
            "The code could not be copied automatically.",
            "Select the code in the output panel and copy it manually.",
        );
    }
}

function loadSample() {
    ui.source.value = JSON.stringify(SAMPLE_DATA, null, 2);
    updateSourceCount();
    addLog("info", "Loaded the sample Excalidraw drawing.");
    convertDrawing();
}

function clearSource() {
    ui.source.value = "";
    markSourceDirty();
    clearConversionOutput();
    setStatus("dirty", "Input cleared");
    setPreviewPill("Waiting for data");
    addLog("info", "Source input and generated output were cleared.");
    ui.source.focus();
}

function setPanelCollapsed(panelName, collapsed) {
    const panel = document.querySelector(`[data-panel="${panelName}"]`);
    const toggle = document.querySelector(`[data-panel-toggle="${panelName}"]`);
    if (!panel || !toggle) return;
    panel.classList.toggle("is-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute(
        "aria-label",
        `${collapsed ? "Expand" : "Collapse"} ${panelName} panel`,
    );
    if (panelName === "preview" && !collapsed)
        renderPreview(state.lastResult?.elements ?? []);
}

function setAllPanels(collapsed) {
    for (const panel of document.querySelectorAll("[data-panel]")) {
        setPanelCollapsed(panel.dataset.panel, collapsed);
    }
}

function bindEvents() {
    ui.source.addEventListener("input", markSourceDirty);
    ui.source.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            convertDrawing();
        }
    });
    ui.convert.addEventListener("click", convertDrawing);
    ui.loadSample.addEventListener("click", loadSample);
    ui.clearSource.addEventListener("click", clearSource);
    ui.copy.addEventListener("click", copyCode);
    ui.clearLogs.addEventListener("click", clearLogs);
    ui.expandAll.addEventListener("click", () => setAllPanels(false));
    ui.collapseAll.addEventListener("click", () => setAllPanels(true));

    for (const toggle of document.querySelectorAll("[data-panel-toggle]")) {
        toggle.addEventListener("click", () => {
            const panel = document.querySelector(
                `[data-panel="${toggle.dataset.panelToggle}"]`,
            );
            setPanelCollapsed(
                toggle.dataset.panelToggle,
                !panel.classList.contains("is-collapsed"),
            );
        });
    }

    window.addEventListener("resize", () => {
        window.clearTimeout(state.resizeTimer);
        state.resizeTimer = window.setTimeout(() => {
            renderPreview(state.lastResult?.elements ?? []);
        }, 120);
    });
}

function configurePlatformHint() {
    const isApple = /Mac|iPhone|iPad|iPod/.test(
        navigator.platform || navigator.userAgent,
    );
    const key = isApple ? "⌘ ↵" : "Ctrl ↵";
    ui.shortcut.textContent = key;
    ui.sourceHint.textContent = `Press ${key} to convert`;
}

function init() {
    bindEvents();
    configurePlatformHint();
    renderLogs();
    ui.source.value = JSON.stringify(SAMPLE_DATA, null, 2);
    updateSourceCount();
    addLog("info", "Converter ready. The parser runs locally in this browser.");
    convertDrawing();
}

init();
