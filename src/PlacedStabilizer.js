/** A PauliProduct with associated locations. */

import {PauliProduct} from "src/sim/PauliProduct.js";
import {Point} from "src/base/Point.js";
import {Complex} from "src/base/Complex.js";
import {GeneralMap} from "src/base/GeneralMap.js";

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

class PlacedStabilizer {
    /**
     * @param {!Array.<!Point>} points
     * @param {!PauliProduct} paulis
     */
    constructor(points, paulis) {
        this.points = points;
        this.paulis = paulis;
    }

    /**
     * @param {!string} paulis Pauli character or characters. Can have length 1 (meaning uniform) or length 4 (meaning
     *     each specified individually ordered clockwise in display coordinate space starting at top left).
     * @param {!Point} topLeft
     * @returns {!PlacedStabilizer}
     */
    static unitSquare(paulis, topLeft) {
        let pauliProduct;
        if (paulis.length === 1) {
            pauliProduct = PauliProduct.fromString(paulis.repeat(4));
        } else if (paulis.length === 4) {
            pauliProduct = PauliProduct.fromString(paulis);
        } else {
            throw new Error(`paulis must be one or four characters but got ${paulis}`);
        }

        let points = [
            topLeft,
            topLeft.offsetBy(0, 1),
            topLeft.offsetBy(1, 1),
            topLeft.offsetBy(1, 0),
        ];

        return new PlacedStabilizer(points, pauliProduct);
    }

    /**
     * @param {!string} paulis Pauli character or characters. Can have length 1 (meaning uniform) or length 3 (meaning
     *     each specified individually ordered counter-clockwise in display coordinates starting from root).
     * @param {!Point} rootPoint
     * @param {!int} dx
     * @param {!int} dy
     * @returns {!PlacedStabilizer}
     */
    static unitTriangle(paulis, rootPoint, dx, dy) {
        if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) {
            throw new Error('dx and dy must be +-1');
        }

        let pauliProduct;
        if (paulis.length === 1) {
            pauliProduct = PauliProduct.fromString(paulis.repeat(3));
        } else if (paulis.length === 3) {
            pauliProduct = PauliProduct.fromString(paulis);
        } else {
            throw new Error(`paulis must be one or three characters but got ${paulis}`);
        }

        let a = rootPoint;
        let b = rootPoint.offsetBy(dx, 0);
        let c = rootPoint.offsetBy(0, dy);
        let sign = dx * dy < 0;
        let points = sign ? [a, b, c] : [a, c, b];
        return new PlacedStabilizer(points, pauliProduct);
    }

    /**
     * @param {!string} topLeftPaulis
     * @param {!string} alternatePaulis
     * @param {!Point} topLeft
     * @param {!int} width
     * @param {!int} height
     * @param {!boolean=} parity
     * @returns {!Array.<!PlacedStabilizer>}
     */
    static checkerboard(topLeftPaulis, alternatePaulis, topLeft, width, height, parity=false) {
        let p = parity ? 1 : 0;
        let squares = [];
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < height; j++) {
                let paulis = ((i + j) & 1) === p ? topLeftPaulis : alternatePaulis;
                squares.push(PlacedStabilizer.unitSquare(paulis, topLeft.offsetBy(i, j)));
            }
        }
        return squares;
    }

    /**
     * @param {!string} paulis
     * @param {!Point} start
     * @param {!Point} stop
     * @param {!boolean=} parity
     */
    static boundary(paulis, start, stop, parity=false) {
        let segments = [];

        let d = stop.minus(start);
        if (d.x * d.y !== 0) {
            throw new Error('Boundary must be axis-aligned.');
        }
        let n = Math.abs(d.x + d.y);
        let dx = d.x / n;
        let dy = d.y / n;

        for (let i = parity ? 1 : 0; i < n; i += 2) {
            segments.push(PlacedStabilizer.segment(
                start.offsetBy(dx * i, dy * i),
                start.offsetBy(dx * (i + 1), dy * (i + 1)),
                paulis));
        }

        return segments;
    }

    /**
     * @param {!int} codeDistance
     * @param {!boolean=} orientation Toggles boundary orientation.
     * @param {!boolean=} parity Toggles colors.
     * @returns {!Array.<!PlacedStabilizer>}
     */
    static latticeSurgeryPatch(codeDistance, orientation=false, parity=false) {
        let width = codeDistance + 1;
        let height = codeDistance + 1;
        let topLeft = new Point(0, 0);
        let topRight = topLeft.offsetBy(width, 0);
        let bottomLeft = topLeft.offsetBy(0, height);
        let bottomRight = topLeft.offsetBy(width, height);

        let bulk = PlacedStabilizer.checkerboard('X', 'Z', topLeft, width, height, parity);

        let caps = parity !== orientation ? 'X' : 'Z';
        let par = codeDistance % 2 !== 0;
        let top = PlacedStabilizer.boundary(caps, topRight, topLeft, par !== orientation);
        let bottom = PlacedStabilizer.boundary(caps, bottomLeft, bottomRight, par !== orientation);

        let sides = parity !== orientation ? 'Z' : 'X';
        let left = PlacedStabilizer.boundary(sides, topLeft, bottomLeft, !orientation);
        let right = PlacedStabilizer.boundary(sides, bottomRight, topRight, !orientation);

        return [...bulk, ...top, ...bottom, ...left, ...right];
    }

    /**
     * @param {!int} codeDistance
     * @returns {!PlacedStabilizer}
     */
    static latticeSurgeryPatchLogicalXObservable(codeDistance) {
        let width = codeDistance + 1;
        let pts = [];
        for (let i = width; i >= 0; i--) {
            pts.push(new Point(i, i === width && (width % 2 === 0) ? 1 : 0));
        }
        let paulis = PauliProduct.fromString('X'.repeat(pts.length));
        return new PlacedStabilizer(pts, paulis);
    }

    /**
     * @param {!int} codeDistance
     * @returns {!PlacedStabilizer}
     */
    static latticeSurgeryPatchLogicalZObservable(codeDistance) {
        let width = codeDistance + 1;
        let pts = [];
        for (let i = 0; i <= width; i++) {
            pts.push(new Point(0, i));
        }
        let paulis = PauliProduct.fromString('Z'.repeat(pts.length));
        return new PlacedStabilizer(pts, paulis);
    }

    /**
     * @param {!int} codeDistance
     * @returns {!PlacedStabilizer}
     */
    static latticeSurgeryPatchLogicalYObservable(codeDistance) {
        let x = PlacedStabilizer.latticeSurgeryPatchLogicalXObservable(codeDistance);
        let z = PlacedStabilizer.latticeSurgeryPatchLogicalZObservable(codeDistance);
        return x.times(z).times(Complex.I);
    }

    /**
     * Note that the segment will be drawn with a bulge on the right hand side, in display coordinates, when looking
     * from the first to the second point.
     *
     * @param {!Point} first
     * @param {!Point} second
     * @param {!string} paulis Pauli character or characters. Can have length 1 (meaning uniform) or length 2 (meaning
     *     each specified individually ordered first then second).
     * @returns {!PlacedStabilizer}
     */
    static segment(first, second, paulis) {
        let pauliProduct;
        if (paulis.length === 1) {
            pauliProduct = PauliProduct.fromString(paulis.repeat(2));
        } else if (paulis.length === 2) {
            pauliProduct = PauliProduct.fromString(paulis);
        } else {
            throw new Error(`paulis must be one or two characters but got ${paulis}`);
        }
        return new PlacedStabilizer([first, second], pauliProduct);
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
     * @param {!PlacedStabilizer} other
     */
    times(other) {
        if (!(other instanceof PlacedStabilizer)) {
            return new PlacedStabilizer(
                this.points,
                this.paulis.times(other));
        }

        let points = [...this.points];
        let pointMap = new GeneralMap();
        for (let pt of this.points) {
            pointMap.set(pt, pointMap.size);
        }

        let indexMap = new Map();
        for (let i = 0; i < other.points.length; i++) {
            let pt = other.points[i];
            if (!pointMap.has(pt)) {
                pointMap.set(pt, pointMap.size);
                points.push(pt);
            }
            indexMap.set(i, pointMap.get(pt));
        }

        let p1 = this.paulis.scatter(points.length, i => i);
        let p2 = other.paulis.scatter(points.length, i => indexMap.get(i));
        return new PlacedStabilizer(points, p1.times(p2));
    }

    /**
     * @param {!ChpSimulator} sim
     * @param {!function(!Point): *} qubitAt
     * @param {!boolean} active
     * @returns {{main: !string, per: !Array.<!string>}}
     */
    colors(sim, qubitAt, active) {
        let r = this.paulis.toString().substr(1);
        let hasX = r.indexOf('X') !== -1 ? 1 : 0;
        let hasY = r.indexOf('Y') !== -1 ? 1 : 0;
        let hasZ = r.indexOf('Z') !== -1 ? 1 : 0;
        let brightness;
        if (active) {
            brightness = this.measure(sim, qubitAt) ? 0 : 1;
        } else {
            brightness = 1 - this.probability(sim, qubitAt);
        }

        let mainColor = pauliColor(hasX + hasY + hasZ !== 1 ? '_' : r[0], brightness);
        let individualColors = [];
        for (let i = 0; i < r.length; i++) {
            individualColors.push(pauliColor(r[i], brightness));
        }
        return {main: mainColor, per: individualColors}
    }

    /**
     * @param {!ChpSimulator} sim
     * @param {!function(!Point): *} qubitAt
     * @param {*} ancilla
     */
    cnotOnto(sim, qubitAt, ancilla) {
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
     * @param {!ChpSimulator} sim
     * @param {!function(!Point): *} qubitAt
     * @param {!number} bias
     * @returns {!boolean}
     */
    measure(sim, qubitAt, bias=undefined) {
        let ancilla = sim.qalloc();
        try {
            this.cnotOnto(sim, qubitAt, ancilla);
            return sim.measure(ancilla, bias).result;
        } finally {
            sim.free(ancilla);
        }
    }

    /**
     * @param {!ChpSimulator} sim
     * @param {!function(!Point): *} qubitAt
     * @returns {!number}
     */
    probability(sim, qubitAt) {
        let ancilla = sim.qalloc();
        try {
            this.cnotOnto(sim, qubitAt, ancilla);
            let result = sim.probability(ancilla);
            this.cnotOnto(sim, qubitAt, ancilla);
            return result;
        } finally {
            sim.free(ancilla);
        }
    }

    /**
     * @param {!CanvasRenderingContext2D} ctx
     * @param {!ChpSimulator} sim
     * @param {!function(!Point): *} qubitAt
     * @param {!boolean} active
     */
    draw(ctx, sim, qubitAt, active) {
        let colors = this.colors(sim, qubitAt, active);

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
            ctx.closePath();
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

    toString() {
        return `Paulis: ${this.paulis}, Points: ${this.points}`;
    }
}

export {PlacedStabilizer}
