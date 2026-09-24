/**
 * Canvas preview for normalized Excalidraw elements.
 *
 * Rendering is intentionally isolated from parsing and from page controls. The
 * renderer only receives normalized elements and knows how to draw them on a
 * canvas.
 */

const DEFAULT_PADDING = 28;
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 720;
const MIN_WIDTH = 320;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function pointBounds(points) {
    if (!points?.length) return null;
    let minX = points[0][0];
    let minY = points[0][1];
    let maxX = points[0][0];
    let maxY = points[0][1];

    for (const [x, y] of points.slice(1)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function unionBounds(first, second) {
    if (!first) return second;
    if (!second) return first;
    const minX = Math.min(first.minX, second.minX);
    const minY = Math.min(first.minY, second.minY);
    const maxX = Math.max(first.maxX, second.maxX);
    const maxY = Math.max(first.maxY, second.maxY);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function elementBounds(element) {
    const arrowPadding = element.type === "arrow" ? 12 : 0;
    const strokePadding = Math.max(2, element.strokeWidth || 0, arrowPadding);
    if (element.type === "ellipse" && element.center) {
        const radiusX = Math.abs(element.radius?.[0] ?? element.width / 2);
        const radiusY = Math.abs(element.radius?.[1] ?? element.height / 2);
        const angle = finite(element.angle);
        const extentX = Math.sqrt(
            (radiusX * Math.cos(angle)) ** 2 + (radiusY * Math.sin(angle)) ** 2,
        );
        const extentY = Math.sqrt(
            (radiusX * Math.sin(angle)) ** 2 + (radiusY * Math.cos(angle)) ** 2,
        );
        return {
            minX: element.center[0] - extentX - strokePadding,
            minY: element.center[1] - extentY - strokePadding,
            maxX: element.center[0] + extentX + strokePadding,
            maxY: element.center[1] + extentY + strokePadding,
        };
    }

    if (element.type === "text") {
        return {
            minX: element.x - strokePadding,
            minY: element.y - strokePadding,
            maxX: element.x + Math.max(element.width, 1) + strokePadding,
            maxY:
                element.y +
                Math.max(element.height, element.fontSize) +
                strokePadding,
        };
    }

    const pointsBounds = pointBounds(element.points);
    if (!pointsBounds) return null;
    return {
        minX: pointsBounds.minX - strokePadding,
        minY: pointsBounds.minY - strokePadding,
        maxX: pointsBounds.maxX + strokePadding,
        maxY: pointsBounds.maxY + strokePadding,
    };
}

function contentBounds(elements) {
    const bounds = elements.reduce(
        (result, element) => unionBounds(result, elementBounds(element)),
        null,
    );
    if (!bounds) return null;
    return {
        ...bounds,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
    };
}

export class CanvasRenderer {
    constructor(canvas) {
        if (!canvas)
            throw new Error("CanvasRenderer requires a canvas element.");
        this.canvas = canvas;
        this.context = canvas.getContext("2d");
        if (!this.context)
            throw new Error(
                "The browser does not support a 2D canvas context.",
            );
        this.elements = [];
        this.layout = null;
    }

    /** Render normalized elements and return the computed layout for callers/tests. */
    render(elements = []) {
        this.elements = Array.isArray(elements) ? elements : [];
        const bounds = contentBounds(this.elements);
        const parentWidth = Math.floor(
            this.canvas.parentElement?.getBoundingClientRect().width || 900,
        );
        const viewportWidth = Math.max(MIN_WIDTH, parentWidth);
        const pixelRatio = Math.max(
            1,
            Math.min(3, window.devicePixelRatio || 1),
        );

        let logicalWidth = viewportWidth;
        let logicalHeight = 360;
        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;

        if (bounds) {
            const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
            const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
            const aspect = contentWidth / contentHeight;
            logicalHeight = clamp(
                Math.round(viewportWidth / aspect),
                MIN_HEIGHT,
                MAX_HEIGHT,
            );
            scale = Math.min(
                (logicalWidth - DEFAULT_PADDING * 2) / contentWidth,
                (logicalHeight - DEFAULT_PADDING * 2) / contentHeight,
            );
            // Very large source drawings should remain visible instead of becoming
            // microscopic because of an accidentally enormous coordinate.
            scale = Math.max(0.01, Math.min(scale, 20));
            offsetX =
                (logicalWidth - contentWidth * scale) / 2 - bounds.minX * scale;
            offsetY =
                (logicalHeight - contentHeight * scale) / 2 -
                bounds.minY * scale;
        }

        this.canvas.width = Math.round(logicalWidth * pixelRatio);
        this.canvas.height = Math.round(logicalHeight * pixelRatio);
        this.canvas.style.height = `${logicalHeight}px`;

        const context = this.context;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        context.setTransform(
            pixelRatio * scale,
            0,
            0,
            pixelRatio * scale,
            pixelRatio * offsetX,
            pixelRatio * offsetY,
        );

        for (const element of this.elements) this.drawElement(element);

        this.layout = {
            width: logicalWidth,
            height: logicalHeight,
            pixelRatio,
            scale,
            offsetX,
            offsetY,
            bounds,
        };
        return this.layout;
    }

    drawElement(element) {
        const context = this.context;
        context.save();
        context.globalAlpha = clamp(finite(element.opacity, 1), 0, 1);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = Math.max(0, finite(element.strokeWidth));
        context.strokeStyle = element.strokeColor || "#1e1e1e";
        context.fillStyle = element.backgroundColor || "transparent";
        context.setLineDash(element.strokeStyle === "dashed" ? [8, 6] : []);

        switch (element.type) {
            case "rectangle":
                this.drawPolygon(element.points, element.filled);
                break;
            case "ellipse":
                this.drawEllipse(element);
                break;
            case "text":
                this.drawText(element);
                break;
            case "freedraw":
                this.drawFreehand(element.points);
                break;
            case "line":
                this.drawPolygon(element.points, element.filled);
                break;
            case "arrow":
                this.drawPolygon(element.points, false);
                this.drawArrowheads(element);
                break;
            default:
                break;
        }

        context.restore();
    }

    drawPolygon(points = [], filled = false) {
        if (!points.length) return;
        const context = this.context;
        context.beginPath();
        context.moveTo(points[0][0], points[0][1]);
        for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
        if (filled) {
            context.closePath();
            context.fill();
        }
        if (this.context.lineWidth > 0) context.stroke();
    }

    drawEllipse(element) {
        const context = this.context;
        const [centerX, centerY] = element.center;
        const [radiusX, radiusY] = element.radius;
        context.beginPath();
        context.ellipse(
            centerX,
            centerY,
            Math.abs(radiusX),
            Math.abs(radiusY),
            element.angle,
            0,
            Math.PI * 2,
        );
        if (element.filled) context.fill();
        if (context.lineWidth > 0) context.stroke();
        context.closePath();
    }

    drawFreehand(points = []) {
        if (!points.length) return;
        const context = this.context;
        context.beginPath();
        context.moveTo(points[0][0], points[0][1]);
        for (let index = 1; index < points.length - 1; index += 1) {
            const current = points[index];
            const next = points[index + 1];
            const midpointX = (current[0] + next[0]) / 2;
            const midpointY = (current[1] + next[1]) / 2;
            context.quadraticCurveTo(
                current[0],
                current[1],
                midpointX,
                midpointY,
            );
        }
        if (points.length > 1) {
            const last = points[points.length - 1];
            context.lineTo(last[0], last[1]);
        }
        if (context.lineWidth > 0) context.stroke();
    }

    drawText(element) {
        const context = this.context;
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;
        context.translate(centerX, centerY);
        context.rotate(element.angle);
        context.font = `${Math.max(1, element.fontSize)}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle =
            element.strokeColor === "transparent"
                ? "#1e1e1e"
                : element.strokeColor;
        context.fillText(element.text, 0, 0);
    }

    drawArrowheads(element) {
        if (element.strokeColor === "transparent" || element.strokeWidth <= 0)
            return;
        const points = element.points;
        if (points.length < 2) return;

        const size = Math.max(8, Math.min(22, element.strokeWidth * 5));
        if (element.startArrowhead) {
            this.drawArrowHead(points[0], points[1], size, element.strokeColor);
        }
        if (element.endArrowhead) {
            this.drawArrowHead(
                points[points.length - 1],
                points[points.length - 2],
                size,
                element.strokeColor,
            );
        }
    }

    drawArrowHead(tip, previous, size, color) {
        const context = this.context;
        const angle = Math.atan2(tip[1] - previous[1], tip[0] - previous[0]);
        const baseX = tip[0] - Math.cos(angle) * size;
        const baseY = tip[1] - Math.sin(angle) * size;
        const wing = size * 0.45;

        context.save();
        context.fillStyle = color === "transparent" ? "#1e1e1e" : color;
        context.strokeStyle = context.fillStyle;
        context.lineWidth = Math.max(1, size * 0.12);
        context.beginPath();
        context.moveTo(tip[0], tip[1]);
        context.lineTo(
            baseX - Math.sin(angle) * wing,
            baseY + Math.cos(angle) * wing,
        );
        context.lineTo(
            baseX + Math.sin(angle) * wing,
            baseY - Math.cos(angle) * wing,
        );
        context.closePath();
        context.fill();
        context.stroke();
        context.restore();
    }
}

export default CanvasRenderer;
