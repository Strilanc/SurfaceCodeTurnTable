/**
 * Entry point for the whole program.
 */

import {DetailedError} from 'src/base/DetailedError.js'
import {describe} from "src/base/Describe.js";
window.onerror = function(msg, url, line, col, error) {
    document.getElementById('err_msg').innerText = `${describe(msg)}\n${error.stack}`;
    document.getElementById('err_line').innerText = describe(line);
    document.getElementById('err_time').innerText = '' + new Date().getMilliseconds();
    if (error instanceof DetailedError) {
        document.getElementById('err_gen').innerText = describe(error.details);
    }
};

import {Revision} from "src/base/Revision.js";
import {ChpSimulator} from "src/sim/ChpSimulator.js";
import {PauliProduct} from "src/sim/PauliProduct.js";
import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {MathPainter} from "src/MathPainter.js";
import {Painter} from "src/Painter.js";
import {Rect} from "src/base/Rect.js";
import {seq} from "src/base/Seq.js";
import {Point} from "src/base/Point.js";
import {ObservableValue} from "src/base/Obs.js";
import {initUndoRedo} from "src/ui/UndoRedo.js";
import {initUrlSync} from "src/ui/Url.js";
import {initClear} from "src/ui/Clear.js";
import {initExports, obsExportsIsShowing} from "src/ui/Export.js";
import {PlacedStabilizer} from "src/PlacedStabilizer.js";

const canvas = /** @type {!HTMLCanvasElement} */ document.getElementById('main-canvas');
const canvasDiv = /** @type {!HTMLDivElement} */ document.getElementById('main-canvas-div');

let mouseX = undefined;
let mouseY = undefined;
let curCtrlKey = false;
let curAltKey = false;
let curShiftKey = false;
let curMouseButton = undefined;
let mouseDownX = undefined;
let mouseDownY = undefined;

let revision = new Revision([''], 0, false);

let obsIsAnyOverlayShowing = new ObservableValue(false);
initUrlSync(revision);
initUndoRedo(revision, obsIsAnyOverlayShowing);
initClear(revision, obsIsAnyOverlayShowing.observable());

class StabilizerGroup {
    /**
     * @param {!string} name
     * @param {!Array.<!PlacedStabilizer>} stabilizers
     */
    constructor(name, stabilizers) {
        this.name = name;
        this.stabilizers = stabilizers;
        this.active = false;
    }

    /**
     * @param {!ChpSimulator} sim
     * @param {!function(!Point): *} qubitAt
     * @param {!number|undefined=} bias
     */
    measure(sim, qubitAt, bias=undefined) {
        for (let stabilizer of this.stabilizers) {
            stabilizer.measure(sim, qubitAt, bias);
        }
    }

    /**
     * @param {!CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        ctx.fillStyle = 'black';
        ctx.fillText(this.name + (this.active ? '' : ' (not active)'), 0, 10);
        for (let s of this.stabilizers) {
            s.draw(ctx, sim, qubitAt, this.active);
        }
    }
}

/**
 * @param {!Point} pt
 * @returns {!int}
 */
function qubitAt(pt) {
    if (!qubitMap.has(pt)) {
        qubitMap.set(pt, sim.qalloc());
    }
    return qubitMap.get(pt);
}

let qubitMap = new GeneralMap();
let stabilizerGroups = [];

/**
 * @param {!int} n
 * @param {!int} d
 * @returns {!Array.<!PlacedStabilizer>}
 */
function yConfigPoints(n, d) {
    let rs = [];
    rs.push(new PlacedStabilizer([new Point(1, 0)], PauliProduct.fromString('X')));
    rs.push(new PlacedStabilizer([new Point(0, 0)], PauliProduct.fromString('Y')));
    for (let i = 1; i < d - 1; i++) {
        rs.push(new PlacedStabilizer([new Point(1, i)], PauliProduct.fromString('Y')));
    }
    rs.push(new PlacedStabilizer([new Point(1, d - 1)], PauliProduct.fromString(d % 2 ? 'X' : 'Z')));
    for (let i = 2; i < n - 1; i++) {
        rs.push(new PlacedStabilizer([new Point(i, d - 1)], PauliProduct.fromString('Y')));
    }
    rs.push(new PlacedStabilizer([new Point(n - 1, d - 1)], PauliProduct.fromString(d % 2 ? 'X' : 'Z')));
    for (let i = d; i < n; i++) {
        rs.push(new PlacedStabilizer([new Point(n - 1, i)], PauliProduct.fromString('Y')));
    }
    rs.push(new PlacedStabilizer([new Point(n - 1, n)], PauliProduct.fromString('X')));
    rs.push(new PlacedStabilizer([new Point(n, n)], PauliProduct.fromString('Y')));

    return rs;
}

/**
 * @param {!int} n
 * @param {!int} d
 * @returns {!PlacedStabilizer}
 */
function logicalYObservableZigXag(n, d) {
    let rs = yConfigPoints(n, d);
    let ss = [];
    for (let r of rs) {
        ss.push(r.points[0]);
    }
    let zz = '';
    for (let r of rs) {
        zz += r.paulis.toString()[1];
    }
    return new PlacedStabilizer(ss, PauliProduct.fromString(zz));
}

/**
 * @param {!int} n
 * @param {!string} basis
 * @returns {!Array.<!PlacedStabilizer>}
 */
function init(n, basis) {
    let stabilizers = [];
    for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n; j++) {
            stabilizers.push(new PlacedStabilizer([new Point(i, j)], PauliProduct.fromString(basis)));
        }
    }
    return stabilizers;
}

/**
 * @param {!int} n
 * @returns {!Array.<!PlacedStabilizer>}
 */
function yConfigurationBorderHugger(n) {
    let codeDistance = n - 1;
    let changedBody = [];

    changedBody.push(...PlacedStabilizer.checkerboard(
        'YZZY',
        'X',
        new Point(1, 0),
        n - codeDistance % 2 - 1,
        1));

    changedBody.push(...PlacedStabilizer.checkerboard(
        'Z',
        'YYXX',
        new Point(0, 1),
        1,
        n - codeDistance % 2 - 1));

    changedBody.push(PlacedStabilizer.unitTriangle('XZY', new Point(1, 1), -1, -1));
    if (n % 2 === 0) {
        changedBody.push(PlacedStabilizer.unitTriangle('Z', new Point(1, n-1), -1, +1));
        changedBody.push(PlacedStabilizer.unitTriangle('X', new Point(n-1, 2), +1, -1));
    }

    let par = codeDistance % 2 !== 0;
    let left = PlacedStabilizer.boundary('YY', new Point(n, 0), new Point(2, 0), par);
    let top = PlacedStabilizer.boundary('YY', new Point(0, 0), new Point(0, n - 2), true);

    let touchedPoints = new GeneralSet(
        ...PlacedStabilizer.latticeSurgeryPatchLogicalYObservable(codeDistance).points);
    let unchanged = PlacedStabilizer.latticeSurgeryPatch(n - 1).filter(
        e => e.points.every(p => !touchedPoints.has(p)));
    return [...top, ...left, ...unchanged, ...changedBody];
}

/**
 * @param {!Point} p
 * @param {!Point} d
 * @param {!int} b
 * @returns {Array.<!PauliProduct>}
 */
function twistLineStabilizers(p, d, b) {
    let n = Math.abs(d.x + d.y);
    d = new Point(d.x / n, d.y / n);
    let t = new Point(-d.y, d.x);
    let rs = [];
    for (let i = 0; i < n; i++) {
        rs.push(new PlacedStabilizer(
            [p.minus(t).plus(d), p.minus(t), p.plus(t), p.plus(t).plus(d)],
            PauliProduct.fromString(i % 2 === b ? 'XXZZ' : 'ZZXX')));
        p = p.plus(d);
    }
    return rs;
}

/**
 * @param {!Point} p
 * @param {!Point} d
 * @param {!int} s
 * @returns {Array.<!PauliProduct>}
 */
function twistCornerStabilizers(p, d, s) {
    let dx = d.x;
    let dy = d.y;
    let rs = [];
    rs.push(new PlacedStabilizer(
        [
            p.offsetBy(-dx, dy),
            p.offsetBy(-dx, 0),
            p.offsetBy(0, -dy),
            p.offsetBy(dx, -dy),
            p.offsetBy(dx, dy),
        ],
        PauliProduct.fromString(s ? 'ZZZZX' : 'XXXXZ')));
    rs.push(new PlacedStabilizer(
        [
            p.offsetBy(-dx, 0),
            p.offsetBy(-dx, -dy),
            p.offsetBy(0, -dy),
        ],
        PauliProduct.fromString(s ? 'XXX' : 'ZZZ')));
    return rs;
}

/**
 * @param {!int} n
 * @param {!int} d
 * @returns {Array.<!PauliProduct>}
 */
function yConfigStabilizers(n, d) {
    let rs = [];

    if (d > 2) {
        rs.push(new PlacedStabilizer(
            [
                new Point(0, 1),
                new Point(2, 1),
                new Point(2, 0),
            ],
            PauliProduct.fromString('XZZ')));
        rs.push(...twistLineStabilizers(new Point(1, 1), new Point(0, d - 3), 0));
        rs.push(...twistCornerStabilizers(new Point(1, d - 1), new Point(1, -1), d % 2));
    } else {
        rs.push(new PlacedStabilizer(
            [new Point(0, 2), new Point(1, 2), new Point(0, 1)],
            PauliProduct.fromString('ZZZ')
        ));
        rs.push(new PlacedStabilizer(
            [new Point(0, 1), new Point(1, 2), new Point(2, 2), new Point(2, 0)],
            PauliProduct.fromString('XXXZ')
        ));
    }
    rs.push(...twistLineStabilizers(new Point(2, d-1), new Point(n-4, 0), d % 2));
    rs.push(...twistCornerStabilizers(new Point(n-1, d-1), new Point(-1, 1), d % 2));
    rs.push(...twistLineStabilizers(new Point(n-1, d), new Point(0, n-d-1), (d + 1) % 2));

    rs.push(new PlacedStabilizer(
        [
            new Point(n-0, n-1),
            new Point(n-2, n-1),
            new Point(n-2, n-0),
        ],
        PauliProduct.fromString('XZZ')));

    let pts2 = new GeneralSet(...yConfigPoints(n, d).map(e => e.points[0]));
    let rs2 = PlacedStabilizer.latticeSurgeryPatch(n - 1).filter(e => e.points.every(p => !pts2.has(p)));
    return [...rs2, ...rs];
}

let n = 10;
let codeDistance = n - 1;
let sim = new ChpSimulator((codeDistance + 2)*(codeDistance + 2) + 1);
stabilizerGroups.push(new StabilizerGroup("Standard", PlacedStabilizer.latticeSurgeryPatch(codeDistance)));
stabilizerGroups.push(new StabilizerGroup("force X", init(n, 'X')));
stabilizerGroups.push(new StabilizerGroup("force Z", init(n, 'Z')));
stabilizerGroups.push(new StabilizerGroup("force Y", yConfigurationBorderHugger(n)));


stabilizerGroups.push(new StabilizerGroup("X_L",
    [PlacedStabilizer.latticeSurgeryPatchLogicalXObservable(codeDistance)]));
stabilizerGroups.push(new StabilizerGroup("Y_L",
    [PlacedStabilizer.latticeSurgeryPatchLogicalYObservable(codeDistance)]));
stabilizerGroups.push(new StabilizerGroup("Z_L",
    [PlacedStabilizer.latticeSurgeryPatchLogicalZObservable(codeDistance)]));
stabilizerGroups.push(new StabilizerGroup("error X", init(0, 'X')));


function draw() {
    canvas.width = canvasDiv.clientWidth;
    canvas.height = 800;

    let ctx = /** @type {!CanvasRenderingContext2D} */ canvas.getContext('2d');
    ctx.clearRect(0, 0, 10000, 10000);

    ctx.save();
    try {
        for (let i = 0; i < stabilizerGroups.length; i++) {
            ctx.save();
            try {
                ctx.translate((i % 4) * 300, Math.floor(i / 4) * 300);
                ctx.fillStyle = '#AAA';
                if (stabilizerGroups[i].active) {
                    ctx.fillRect(0, 0, 290, 290);
                    stabilizerGroups[i].draw(ctx);
                }
            } finally {
                ctx.restore();
            }
        }

        for (let i = 0; i < stabilizerGroups.length; i++) {
            ctx.save();
            try {
                ctx.translate((i % 4) * 300, Math.floor(i / 4) * 300);
                if (!stabilizerGroups[i].active) {
                    stabilizerGroups[i].draw(ctx);
                }
            } finally {
                ctx.restore();
            }
        }
    } finally {
        ctx.restore();
    }
}

/**
 * @param {!MouseEvent} ev
 * @param {!HTMLElement} element
 * @returns {![!number, !number]}
 */
function eventPosRelativeTo(ev, element) {
    let b = element.getBoundingClientRect();
    return [ev.clientX - b.left, ev.clientY - b.top];
}


canvasDiv.addEventListener('mousedown', ev => {
    if (ev.which !== 1 && ev.which !== 2) {
        return;
    }
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;
    curMouseButton = ev.which;
    ev.preventDefault();
    [mouseDownX, mouseDownY] = eventPosRelativeTo(ev, canvasDiv);
    let x = Math.floor(mouseDownX / 300);
    let y = Math.floor(mouseDownY / 300);
    if (x >= 0 && x < 4 && y >= 0) {
        let i = x + y*4;
        if (i < stabilizerGroups.length) {
            stabilizerGroups[i].active = !stabilizerGroups[i].active;
        }
    }
    draw();
});

canvasDiv.addEventListener('mouseup', ev => {
});

canvasDiv.addEventListener('mousemove', ev => {
    [mouseX, mouseY] = eventPosRelativeTo(ev, canvasDiv);
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;
    curMouseButton = ev.which;
    draw();
});

canvasDiv.addEventListener('mouseleave', ev => {
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;
    mouseX = undefined;
    mouseY = undefined;
    draw();
});

document.addEventListener('keydown', e => {
    let digit = undefined;
    if (e.keyCode >= 48 && e.keyCode <= 57) {
        digit = e.keyCode - 48;
    }
    if (e.keyCode >= 96 && e.keyCode <= 105) {
        digit = e.keyCode - 96;
    }
    if (digit !== undefined) {
        digit -= 1;
        if (digit < 0) {
            digit += 10;
        }
        if (digit < stabilizerGroups.length) {
            stabilizerGroups[digit].active = !stabilizerGroups[digit].active;
        }
    }
    draw();
});

revision.latestActiveCommit().subscribe(text => {
    //noinspection EmptyCatchBlockJS,UnusedCatchParameterJS
    try {
        draw();
    } catch (_) {
        // Ensure subscription starts. Will be rethrown on next draw anyways.
    }
});

// setInterval(draw, 100);
