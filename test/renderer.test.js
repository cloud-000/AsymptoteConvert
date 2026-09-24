import test from "node:test";
import assert from "node:assert/strict";

import { CanvasRenderer } from "../renderer.js";
import { parseExcalidraw } from "../parser.js";
import { SAMPLE_DATA } from "../sample-data.js";

function fakeContext(calls) {
    return new Proxy(
        {},
        {
            get(_target, property) {
                if (property === "canvas") return {};
                return (...args) => calls.push([property, ...args]);
            },
            set(_target, property, value) {
                calls.push(["set", property, value]);
                return true;
            },
        },
    );
}

test("canvas renderer lays out and draws normalized elements", () => {
    const calls = [];
    const context = fakeContext(calls);
    const canvas = {
        width: 0,
        height: 0,
        style: {},
        parentElement: { getBoundingClientRect: () => ({ width: 800 }) },
        getContext: () => context,
    };

    const previousWindow = globalThis.window;
    globalThis.window = { devicePixelRatio: 2 };
    try {
        const renderer = new CanvasRenderer(canvas);
        const result = parseExcalidraw(SAMPLE_DATA);
        const layout = renderer.render(result.elements);

        assert.equal(layout.width, 800);
        assert.ok(layout.height >= 240);
        assert.ok(calls.some(([method]) => method === "ellipse"));
        assert.ok(calls.some(([method]) => method === "fill"));
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});
