import {Measurement} from "src/sim/Measurement.js"
import {SimulatorSpec} from "src/sim/SimulatorSpec.js";
import {PauliProduct} from "src/sim/PauliProduct.js";
import {equate_Iterables} from "src/base/Equate.js"


class SimStabilizer {
    /**
     * @param {!Array.<!int>} qubits
     * @param {!PauliProduct} paulis
     */
    constructor(qubits, paulis) {
        if (!qubits.every(e => Number.isInteger(e))) {
            throw new Error('qubits must be integers');
        }
        this.qubits = qubits;
        this.paulis = paulis;
    }

    /**
     * @param {!ChpSimulator} sim
     */
    foldIn(sim) {
        let buf = this.paulis.toString().substr(1);
        for (let i = 0; i < buf.length; i++) {
            let q = this.qubits[i];
            if (buf[i] === 'X') {
                sim.hadamard(q);
            } else if (buf[i] === 'Y') {
                sim.hadamard(q);
                sim.phase(q);
                sim.phase(q);
                sim.phase(q);
                sim.hadamard(q);
            }
        }
        for (let i = 1; i < this.qubits.length; i++) {
            sim.cnot(this.qubits[i], this.qubits[0]);
        }
    }

    /**
     * @param {!ChpSimulator} sim
     */
    foldOut(sim) {
        let buf = this.paulis.toString().substr(1);
        for (let i = 1; i < this.qubits.length; i++) {
            sim.cnot(this.qubits[i], this.qubits[0]);
        }
        for (let i = 0; i < buf.length; i++) {
            let q = this.qubits[i];
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
     * @param {!SimStabilizer} other
     * @returns {!boolean}
     */
    anti_commutes(other) {
        let p = new Map();
        for (let i = 0; i < this.qubits.length; i++) {
            p.set(this.qubits[i], this.paulis.paulis[i]);
        }
        let n = 0;
        for (let i = 0; i < other.qubits.length; i++) {
            let p1 = other.paulis.paulis[i];
            let p2 = p.get(other.qubits[i]);
            if (p1 && p2 && p1 !== p2) {
                n += 1;
            }
        }
        return n % 2 !== 0;
    }

    isEqualTo(other) {
        return (other instanceof SimStabilizer &&
            equate_Iterables(this.qubits, other.qubits) &&
            this.paulis.isEqualTo(other.paulis))
    }

    toString() {
        return `${this.paulis} @ ${this.qubits}`
    }
}

class CachedStabilizer {
    /**
     * @param {!SimStabilizer} stabilizer
     * @param {*} value
     */
    constructor(stabilizer, value) {
        this.stabilizer = stabilizer;
        this.value = value;
    }

    toString() {
        return `(stabilizer=${this.stabilizer}, value=${this.value})`;
    }
}


class CacheStabilizerSim extends SimulatorSpec {
    /**
     * @param {!ChpSimulator} sub
     */
    constructor(sub) {
        super();
        this.sub = sub;
        this.cached = /** @type {!Map.<!int, !Array.<!CachedStabilizer>>} */ new Map();
    }

    qalloc() {
        let result = this.sub.qalloc();
        this.cached.set(result, []);
        return result;
    }

    /**
     * @param {!CachedStabilizer} s
     */
    _uncache_stabilizer(s) {
        for (let q of s.stabilizer.qubits) {
            let arr = this.cached.get(q);
            let i = arr.indexOf(s);
            arr.splice(i, 1);
        }
    }

    /**
     * @param {!CachedStabilizer} s
     */
    _cache_stabilizer(s) {
        for (let q of s.stabilizer.qubits) {
            this.cached.get(q).push(s);
        }
    }

    /**
     * @param {!int} q
     * @private
     */
    _invalidate_qubit_stabilizers(q) {
        for (let s of [...this.cached.get(q)]) {
            this._uncache_stabilizer(s);
        }
    }

    /**
     * @param {!SimStabilizer} stabilizer
     * @returns {*}
     * @private
     */
    _retrieve(stabilizer) {
        let q = stabilizer.qubits[0];
        let possibleHits = this.cached.get(q);
        for (let s of possibleHits) {
            if (stabilizer.isEqualTo(s.stabilizer)) {
                return s.value;
            }
        }
        return undefined;
    }

    /**
     * @param {!SimStabilizer} stabilizer
     * @private
     */
    _invalidate_anti_commuting_stabilizers(stabilizer) {
        for (let q of stabilizer.qubits) {
            for (let other of [...this.cached.get(q)]) {
                if (stabilizer.anti_commutes(other.stabilizer)) {
                    this._uncache_stabilizer(other);
                }
            }
        }
    }

    free(q) {
        this.sub.free(q);
        this._invalidate_qubit_stabilizers(q);
        this.cached.delete(q);
    }

    phase(q) {
        this._invalidate_qubit_stabilizers(q);
        this.sub.phase(q);
    }

    hadamard(q) {
        this._invalidate_qubit_stabilizers(q);
        this.sub.hadamard(q);
    }

    cnot(control, target) {
        this._invalidate_qubit_stabilizers(control);
        this._invalidate_qubit_stabilizers(target);
        this.sub.cnot(control, target);
    }

    /**
     * @param {!SimStabilizer|!int} q
     * @param {!number|undefined=} bias
     * @returns {!Measurement}
     */
    measure(q, bias=undefined) {
        if (Number.isInteger(q)) {
            return this.measure(new SimStabilizer([q], PauliProduct.fromString('Z')), bias);
        }

        if (q instanceof SimStabilizer) {
            let cachedResult = this._retrieve(q);
            if (cachedResult === 0 || cachedResult === 1) {
                return new Measurement(cachedResult !== 0, false);
            }
            q.foldIn(this.sub);
            let newResult = this.sub.measure(q.qubits[0], bias);
            q.foldOut(this.sub);
            if (newResult.random) {
                for (let qubit of q.qubits) {
                    this._invalidate_qubit_stabilizers(qubit);
                }
            } else {
                this._invalidate_anti_commuting_stabilizers(q);
            }
            this._cache_stabilizer(new CachedStabilizer(q, newResult.result ? 1 : 0));
            return newResult;
        }

        throw new Error(`Don't know how to measure ${q}`);
    }

    /**
     * @param {!SimStabilizer|!int} q
     * @returns {!number}
     */
    probability(q) {
        if (q instanceof SimStabilizer) {
            let cachedResult = this._retrieve(q);
            if (cachedResult !== undefined) {
                return cachedResult;
            }
            q.foldIn(this.sub);
            let newResult = this.sub.probability(q.qubits[0]);
            q.foldOut(this.sub);
            this._cache_stabilizer(new CachedStabilizer(q, newResult));
            return newResult;
        }

        if (Number.isInteger(q)) {
            return this.probability(new SimStabilizer([q], PauliProduct.fromString('Z')));
        }

        throw new Error(`Don't know how to get probability of ${q}`);
    }

    probability_x(q) {
        return this.probability(new SimStabilizer([q], PauliProduct.fromString('X')));
    }

    probability_y(q) {
        return this.probability(new SimStabilizer([q], PauliProduct.fromString('Y')));
    }

    collapse(q, outcome) {
        let m = this.measure(q, outcome ? 1 : 0);
        if (m.result !== outcome) {
            throw new Error("Failed to post-select; result impossible.");
        }
    }
}

export {CacheStabilizerSim, SimStabilizer}
