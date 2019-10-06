import {perfGoal, millis, micros} from "test_perf/TestPerfUtil.js"
import {ChpSimulator} from "src/sim/ChpSimulator.js"


function perfCnots(goal, n) {
    let sim = new ChpSimulator(n);
    for (let i = 0; i < n; i++) {
        sim.qalloc();
    }

    perfGoal(
        `${n}-cnots-${n}-qubits`,
        goal,
        sim => {
            for (let i = 0; i < n; i++) {
                sim.cnot(i, n - i - 1);
            }
        },
        sim);
}

function perfMixAndMeasure(goal, n) {
    let sim = new ChpSimulator(n);
    for (let i = 0; i < n; i++) {
        sim.qalloc();
    }

    perfGoal(
        `mix-and-measure-${n}-qubits`,
        goal,
        sim => {
            for (let i = 0; i < n; i++) {
                sim.hadamard(i);
                sim.cnot(i, (i * 3 + 5) % n);
            }
            for (let i = 0; i < n; i++) {
                sim.measure(i);
            }
        },
        sim);
}

function perfMeasureStabilizer(goal, n) {
    let sim = new ChpSimulator(n);
    for (let i = 0; i < n; i++) {
        sim.qalloc();
    }

    perfGoal(
        `mix-and-measure-${n}-qubits`,
        goal,
        sim => {
            for (let i = 0; i < n; i++) {
                sim.hadamard(i);
                sim.cnot(i, (i * 3 + 5) % n);
            }
            for (let i = 0; i < n; i++) {
                sim.measure(i);
            }
        },
        sim);
}

perfCnots(micros(70), 10);
perfCnots(micros(500), 100);
perfCnots(millis(50), 1000);

perfMixAndMeasure(micros(80), 10);
perfMixAndMeasure(micros(800), 100);
perfMixAndMeasure(millis(100), 1000);
