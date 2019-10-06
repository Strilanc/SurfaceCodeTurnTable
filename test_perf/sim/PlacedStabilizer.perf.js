import {perfGoal, millis, micros} from "test_perf/TestPerfUtil.js"
import {ChpSimulator} from "src/sim/ChpSimulator.js"
import {PlacedStabilizer} from "src/PlacedStabilizer.js"
import {GeneralMap} from "src/base/GeneralMap.js";


function perfMeasureStabilizers(goal, codeDistance) {
    let sim = new ChpSimulator((codeDistance + 2)*(codeDistance + 2) + 10);
    let qubitMap = new GeneralMap();
    function qubitAt(pt) {
        if (!qubitMap.has(pt)) {
            qubitMap.set(pt, sim.qalloc());
        }
        return qubitMap.get(pt);
    }

    let stabilizers = PlacedStabilizer.latticeSurgeryPatch(codeDistance);

    perfGoal(
        `measure-lattice-surgery-stabilizers-code-distance-${codeDistance}`,
        goal,
        sim => {
            for (let s of stabilizers) {
                s.measure(sim, qubitAt);
            }
        },
        sim);
}

perfMeasureStabilizers(millis(3), 5);
perfMeasureStabilizers(millis(15), 10);
perfMeasureStabilizers(millis(50), 15);
perfMeasureStabilizers(millis(120), 20);
perfMeasureStabilizers(millis(260), 25);
