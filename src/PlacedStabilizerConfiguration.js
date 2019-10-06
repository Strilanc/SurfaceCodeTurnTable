class PlacedStabilizerConfiguration {
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
     * @param {!number|undefined=} bias
     */
    measure(bias=undefined) {
        for (let stabilizer of this.stabilizers) {
            stabilizer.measure(bias);
        }
    }

    /**
     * @param {!CanvasRenderingContext2D} ctx
     * @param {!ChpSimulator} sim
     * @param {!function(!Point): *} qubitAt
     */
    draw(ctx, sim, qubitAt) {
        ctx.fillStyle = 'black';
        ctx.fillText(this.name + (this.active ? '' : ' (not active)'), 0, 10);
        for (let placedStabilizer of this.stabilizers) {
            placedStabilizer.draw(ctx, sim, qubitAt, this.active);
        }
    }
}
