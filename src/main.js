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
import {ZxGraph, ZxEdge, ZxNode, optimizeConvertedAdjGraph} from "src/sim/ZxGraph.js";
import {ChpSimulator} from "src/sim/ChpSimulator.js";
import {PauliProduct} from "src/sim/PauliProduct.js";
import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {evalZxGraph_ep} from "src/sim/ZxGraphEval_EprEdge_ParityNode.js";
import {evalZxGraphGroundTruth} from "src/sim/ZxGraphGroundTruth.js";
import {MathPainter} from "src/MathPainter.js";
import {Painter} from "src/Painter.js";
import {Rect} from "src/base/Rect.js";
import {seq} from "src/base/Seq.js";
import {
    Edit,
    removeEdgeEdit,
    removeNodeEdit,
    maybeRemoveConnectingPathEdit,
    maybeContractNodeEdit,
    maybeRemoveEdgeModifier,
    maybeDragNodeEdit,
    setElementKindEdit,
} from "src/edit.js";
import {NODES} from "src/nodes/All.js";
import {makeNodeRingMenu} from "src/ui/RingMenu.js"
import {ZxNodeDrawArgs} from "src/nodes/ZxNodeKind.js";
import {Point} from "src/base/Point.js";
import {floodFillNodeAndUnitEdgeSpace, DisplayedZxGraph} from "src/ui/DisplayedZxGraph.js";
import {ObservableValue} from "src/base/Obs.js";
import {initUndoRedo} from "src/ui/UndoRedo.js";
import {initUrlSync} from "src/ui/Url.js";
import {initClear} from "src/ui/Clear.js";
import {initExports, obsExportsIsShowing} from "src/ui/Export.js";

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

/**
 * @param {!string} pauliText
 * @param {!number} brightness
 * @returns {string}
 */
function pauliColor(pauliText, brightness) {
    let levels;
    if (pauliText === 'X') {
        levels = [
            '#008',
            '#99A',
            '#CCF'];
    } else if (pauliText === 'Z') {
        levels = [
            '#080',
            '#9A9',
            '#CFC'];
    } else if (pauliText === 'Y') {
        levels = [
            '#F00',
            '#B99',
            '#FAA'];
    } else {
        levels = [
            '#888',
            '#AAA',
            '#FFF'
        ];
    }
    if (brightness > 2/3) {
        return levels[2];
    }
    if (brightness > 1/3) {
        return levels[1];
    }
    return levels[0];
}
class Stabilizer {
    /**
     * @param {!Array.<!Point>} points
     * @param {!PauliProduct} paulis
     */
    constructor(points, paulis) {
        this.points = points;
        this.paulis = paulis;
    }

    /**
     * @param {!Point} pt
     */
    deletePoint(pt) {
        for (let i = 0; i < this.points.length; i++) {
            if (this.points[i].isEqualTo(pt)) {
                this.points.splice(i, 1);
                let t = this.paulis.toString();
                t = t.substr(0, i+1) + t.substr(i + 2);
                this.paulis = PauliProduct.fromString(t);
                return;
            }
        }
    }

    /**
     * @param {!boolean} active
     * @returns {{main: !string, per: !Array.<!string>}}
     */
    colors(active) {
        let r = this.paulis.toString().substr(1);
        let hasX = r.indexOf('X') !== -1 ? 1 : 0;
        let hasY = r.indexOf('Y') !== -1 ? 1 : 0;
        let hasZ = r.indexOf('Z') !== -1 ? 1 : 0;
        let brightness;
        if (active) {
            brightness = this.measure() ? 0 : 1;
        } else {
            brightness = 1 - this.probability();
        }

        let mainColor = pauliColor(hasX + hasY + hasZ !== 1 ? '_' : r[0], brightness);
        let individualColors = [];
        for (let i = 0; i < r.length; i++) {
            individualColors.push(pauliColor(r[i], brightness));
        }
        return {main: mainColor, per: individualColors}
    }

    /**
     * @param {*} ancilla
     */
    cnotOnto(ancilla) {
        let buf = this.paulis.toString().substr(1);
        for (let i = 0; i < buf.length; i++) {
            let q = qubitAt(this.points[i]);
            if (buf[i] === 'X') {
                sim.hadamard(q);
            } else if (buf[i] === 'Y') {
                sim.hadamard(q);
                sim.phase(q);
                sim.phase(q);
                sim.phase(q);
                sim.hadamard(q);
            }
            sim.cnot(q, ancilla);
            if (buf[i] === 'X') {
                sim.hadamard(q);
            } else if (buf[i] === 'Y') {
                sim.hadamard(q);
                sim.phase(q);
                sim.hadamard(q);
            }
        }
    }

    /**
     * @param {!number} bias
     * @returns {!boolean}
     */
    measure(bias=undefined) {
        let ancilla = sim.qalloc();
        try {
            this.cnotOnto(ancilla);
            return sim.measure(ancilla, bias).result;
        } finally {
            sim.free(ancilla);
        }
    }

    /**
     * @returns {!number}
     */
    probability() {
        let ancilla = sim.qalloc();
        try {
            this.cnotOnto(ancilla);
            let result = sim.probability(ancilla);
            this.cnotOnto(ancilla);
            return result;
        } finally {
            sim.free(ancilla);
        }
    }

    /**
     * @param {!CanvasRenderingContext2D} ctx
     * @param {!boolean} active
     */
    draw(ctx, active) {
        let colors = this.colors(active);

        let place = pt => pt.times(20).plus(new Point(50.5, 50.5));
        ctx.strokeStyle = 'black';
        ctx.fillStyle = colors.main;

        if (this.points.length === 1) {
            let a = place(this.points[0]);
            ctx.beginPath();
            ctx.arc(a.x, a.y, 5, 0, 2*Math.PI);
            ctx.fill();
            ctx.stroke();
        } else if (this.points.length === 2) {
            let a = place(this.points[0]);
            let b = place(this.points[1]);
            let d = b.minus(a);
            let angle = Math.atan2(d.y, d.x);
            let r = Math.sqrt(d.x*d.x + d.y*d.y) / 2;
            let c = a.plus(b).times(0.5);
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.arc(c.x, c.y, r, angle, angle + Math.PI);
            ctx.fill();
            ctx.stroke();
        } else {
            let p = place(this.points[this.points.length - 1]);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            for (let pt of this.points) {
                p = place(pt);
                ctx.lineTo(p.x, p.y);
            }
            ctx.fill();

            for (let j = 0; j < this.points.length; j++) {
                ctx.fillStyle = colors.per[j];
                let i = (j + this.points.length - 1) % this.points.length;
                let k = (j + 1) % this.points.length;
                let a = place(this.points[i]);
                let b = place(this.points[j]);
                let c = place(this.points[k]);
                let a1 = Math.atan2(a.y-b.y, a.x-b.x);
                let a2 = Math.atan2(c.y-b.y, c.x-b.x);
                let da = (a1 - a2 + Math.PI) % (2 * Math.PI) - Math.PI;
                if (Math.abs(da) < 1e-8) {
                    a1 -= Math.PI/2;
                    a2 += Math.PI/2;
                }
                let r1 = a.minus(b);
                let r2 = c.minus(b);
                r1 = Math.sqrt(r1.x*r1.x + r1.y*r1.y);
                r2 = Math.sqrt(r2.x*r2.x + r2.y*r2.y);
                let r = Math.min(r1, r2) / 2;
                ctx.beginPath();
                ctx.moveTo(b.x, b.y);
                ctx.arc(b.x, b.y, r, a1, a2);
                ctx.closePath();
                ctx.fill();
            }

            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            for (let pt of this.points) {
                p = place(pt);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }
    }
}

class StabilizerGroup {
    /**
     * @param {!Array.<!Stabilizer>} stabilizers
     */
    constructor(name, stabilizers) {
        this.name = name;
        this.stabilizers = stabilizers;
        this.active = false;
    }

    measure(bias) {
        for (let stabilizer of this.stabilizers) {
            stabilizer.measure(bias);
        }
    }

    /**
     * @param {!CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        ctx.fillStyle = 'black';
        ctx.fillText(this.name + (this.active ? '' : ' (not active)'), 0, 10);
        for (let s of this.stabilizers) {
            s.draw(ctx, this.active);
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
 * @returns {!Array.<!Stabilizer>}
 */
function boardStabilizers(n) {
    let xs = [];
    let zs = [];
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            let pts = [new Point(i, j), new Point(i, j+1), new Point(i+1, j+1), new Point(i+1, j)];
            if ((i + j) % 2 === 0) {
                xs.push(new Stabilizer(pts, PauliProduct.fromString('XXXX')));
            } else {
                zs.push(new Stabilizer(pts, PauliProduct.fromString('ZZZZ')));
            }
        }
    }

    let dd = (n + 1) % 2;
    let ee = n % 2;
    let xs2 = [];
    let zs2 = [];
    for (let i = 0; i < n; i += 2) {
        zs2.push(new Stabilizer(
            [new Point(i+1, 0), new Point(i, 0)],
            PauliProduct.fromString('ZZ')));
        if (i + dd + 1 <= n) {
            zs2.push(new Stabilizer(
                [new Point(i + dd, n), new Point(i + 1 + dd, n)],
                PauliProduct.fromString('ZZ')));
        }
        if (i + 2 <= n) {
            xs2.push(new Stabilizer(
                [new Point(0, i + 1), new Point(0, i + 2)],
                PauliProduct.fromString('XX')));
        }
        if (i + ee + 1 <= n) {
            xs2.push(new Stabilizer(
                [new Point(n, i + ee + 1), new Point(n, i + ee)],
                PauliProduct.fromString('XX')));
        }
    }
    return [...xs2, ...zs2, ...xs, ...zs];
}

/**
 * @param {!int} n
 * @param {!int} d
 * @returns {!Array.<!Stabilizer>}
 */
function yConfigPoints(n, d) {
    let rs = [];
    rs.push(new Stabilizer([new Point(1, 0)], PauliProduct.fromString('X')));
    rs.push(new Stabilizer([new Point(0, 0)], PauliProduct.fromString('Y')));
    for (let i = 1; i < d - 1; i++) {
        rs.push(new Stabilizer([new Point(1, i)], PauliProduct.fromString('Y')));
    }
    rs.push(new Stabilizer([new Point(1, d - 1)], PauliProduct.fromString(d % 2 ? 'X' : 'Z')));
    for (let i = 2; i < n - 1; i++) {
        rs.push(new Stabilizer([new Point(i, d - 1)], PauliProduct.fromString('Y')));
    }
    rs.push(new Stabilizer([new Point(n - 1, d - 1)], PauliProduct.fromString(d % 2 ? 'X' : 'Z')));
    for (let i = d; i < n; i++) {
        rs.push(new Stabilizer([new Point(n - 1, i)], PauliProduct.fromString('Y')));
    }
    rs.push(new Stabilizer([new Point(n - 1, n)], PauliProduct.fromString('X')));
    rs.push(new Stabilizer([new Point(n, n)], PauliProduct.fromString('Y')));

    return rs;
}

/**
 * @param {!int} n
 * @param {!int} d
 * @returns {!Stabilizer}
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
    return new Stabilizer(ss, PauliProduct.fromString(zz), 1000);
}

/**
 * @param {!int} n
 * @returns {!Stabilizer}
 */
function logicalYObservable(n) {
    let pts = [];
    let paulis = '';
    for (let i = n; i >= 1; i--) {
        pts.push(new Point(i, i === n && (n % 2 === 0) ? 1 : 0));
        paulis += 'X';
    }
    pts.push(new Point(0, 0));
    paulis += 'Y';
    for (let i = 1; i <= n; i++) {
        pts.push(new Point(0, i));
        paulis += 'Z';
    }
    return new Stabilizer(pts, PauliProduct.fromString(paulis));
}

/**
 * @param {!int} n
 * @returns {!Stabilizer}
 */
function logicalZObservable(n) {
    let pts = [];
    let paulis = '';
    for (let i = 0; i <= n; i++) {
        pts.push(new Point(0, i));
        paulis += 'Z';
    }
    return new Stabilizer(pts, PauliProduct.fromString(paulis));
}

/**
 * @param {!int} n
 * @returns {!Stabilizer}
 */
function logicalXObservable(n) {
    let pts = [];
    let paulis = '';
    for (let i = n; i >= 0; i--) {
        pts.push(new Point(i, i === n && (n % 2 === 0) ? 1 : 0));
        paulis += 'X';
    }
    return new Stabilizer(pts, PauliProduct.fromString(paulis));
}

/**
 * @param {!int} n
 * @returns {!Array.<Stabilizer>}
 */
function init(n, basis) {
    let stabilizers = [];
    for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n; j++) {
            stabilizers.push(new Stabilizer([new Point(i, j)], PauliProduct.fromString(basis)));
        }
    }
    return stabilizers;
}

/**
 * @param {!int} n
 * @returns {!Array.<!Stabilizer>}
 */
function yConfigurationStabilizers2(n) {
    let rs = [];

    for (let i = 1; i < n - (n % 2 === 0 ? 1 : 0); i++) {
        let j = 0;
        let pts = [new Point(i, j), new Point(i, j+1), new Point(i+1, j+1), new Point(i+1, j)];
        rs.push(new Stabilizer(
            pts,
            PauliProduct.fromString(i % 2 === 0 ? 'XXXX' : 'YZZY')));
    }

    for (let j = 1; j < n - (n % 2 === 0 ? 1 : 0); j++) {
        let i = 0;
        let pts = [new Point(i, j), new Point(i, j+1), new Point(i+1, j+1), new Point(i+1, j)];
        rs.push(new Stabilizer(
            pts,
            PauliProduct.fromString(j % 2 === 1 ? 'ZZZZ' : 'YYXX')));
    }

    rs.push(new Stabilizer(
        [new Point(1, 0), new Point(0, 1), new Point(1, 1)],
        PauliProduct.fromString('ZYX')));
    if (n % 2 === 0) {
        rs.push(new Stabilizer(
            [new Point(1, n), new Point(1, n - 1), new Point(0, n - 1)],
            PauliProduct.fromString(n % 2 === 0 ? 'ZZZ' : 'XXX')));
        rs.push(new Stabilizer(
            [new Point(n, 2), new Point(n - 1, 1), new Point(n - 1, 2)],
            PauliProduct.fromString(n % 2 === 0 ? 'XXX' : 'ZZZ')));
    }

    let xs2 = [];
    let zs2 = [];
    for (let i = 0; i < n; i += 2) {
        if (i > 0 && i + 1 <= n) {
            zs2.push(new Stabilizer(
                [new Point(i + 1, 0), new Point(i, 0)],
                PauliProduct.fromString('YY')));
        }
        if (i + 2 < n) {
            xs2.push(new Stabilizer(
                [new Point(0, i + 1), new Point(0, i + 2)],
                PauliProduct.fromString('YY')));
        }
    }

    let pts2 = new GeneralSet(...logicalYObservable(n).points);
    let rs2 = boardStabilizers(n).filter(e => e.points.every(p => !pts2.has(p)));
    return [...xs2, ...zs2, ...rs2, ...rs];
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
        rs.push(new Stabilizer(
            [p.minus(t).plus(d), p.minus(t), p.plus(t), p.plus(t).plus(d)],
            PauliProduct.fromString(i % 2 === b ? 'XXZZ' : 'ZZXX'),
            500));
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
    rs.push(new Stabilizer(
        [
            p.offsetBy(-dx, dy),
            p.offsetBy(-dx, 0),
            p.offsetBy(0, -dy),
            p.offsetBy(dx, -dy),
            p.offsetBy(dx, dy),
        ],
        PauliProduct.fromString(s ? 'ZZZZX' : 'XXXXZ'),
        500));
    rs.push(new Stabilizer(
        [
            p.offsetBy(-dx, 0),
            p.offsetBy(-dx, -dy),
            p.offsetBy(0, -dy),
        ],
        PauliProduct.fromString(s ? 'XXX' : 'ZZZ'),
        500));
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
        rs.push(new Stabilizer(
            [
                new Point(0, 1),
                new Point(2, 1),
                new Point(2, 0),
            ],
            PauliProduct.fromString('XZZ')));
        rs.push(...twistLineStabilizers(new Point(1, 1), new Point(0, d - 3), 0));
        rs.push(...twistCornerStabilizers(new Point(1, d - 1), new Point(1, -1), d % 2));
    } else {
        rs.push(new Stabilizer(
            [new Point(0, 2), new Point(1, 2), new Point(0, 1)],
            PauliProduct.fromString('ZZZ')
        ));
        rs.push(new Stabilizer(
            [new Point(0, 1), new Point(1, 2), new Point(2, 2), new Point(2, 0)],
            PauliProduct.fromString('XXXZ')
        ));
    }
    rs.push(...twistLineStabilizers(new Point(2, d-1), new Point(n-4, 0), d % 2));
    rs.push(...twistCornerStabilizers(new Point(n-1, d-1), new Point(-1, 1), d % 2));
    rs.push(...twistLineStabilizers(new Point(n-1, d), new Point(0, n-d-1), (d + 1) % 2));

    rs.push(new Stabilizer(
        [
            new Point(n-0, n-1),
            new Point(n-2, n-1),
            new Point(n-2, n-0),
        ],
        PauliProduct.fromString('XZZ')));

    let pts2 = new GeneralSet(...yConfigPoints(n, d).map(e => e.points[0]));
    let rs2 = boardStabilizers(n).filter(e => e.points.every(p => !pts2.has(p)));
    return [...rs2, ...rs];
}

let codeDistance = 10;
let sim = new ChpSimulator((codeDistance + 2)*(codeDistance + 2) + 1);
stabilizerGroups.push(new StabilizerGroup("Standard", boardStabilizers(codeDistance)));
stabilizerGroups.push(new StabilizerGroup("force X", init(codeDistance, 'X')));
stabilizerGroups.push(new StabilizerGroup("force Z", init(codeDistance, 'Z')));
stabilizerGroups.push(new StabilizerGroup("force Y", yConfigurationStabilizers2(codeDistance)));


stabilizerGroups.push(new StabilizerGroup("X_L", [logicalXObservable(codeDistance)]));
stabilizerGroups.push(new StabilizerGroup("Y_L", [logicalYObservable(codeDistance)]));
stabilizerGroups.push(new StabilizerGroup("Z_L", [logicalZObservable(codeDistance)]));


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
                }
                stabilizerGroups[i].draw(ctx);
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
            stabilizerGroups[i].active = true;
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
