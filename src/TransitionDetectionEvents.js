// /** PauliProduct with associated locations. */
//
// import {PauliProduct} from "src/sim/PauliProduct.js";
// import {Point} from "src/base/Point.js";
// import {Complex} from "src/base/Complex.js";
// import {GeneralMap} from "src/base/GeneralMap.js";
// import {Seq, seq} from "src/base/Seq.js";
// import {CacheStabilizerSim, SimStabilizer} from "src/sim/CacheStabilizeSim.js";
// import {PlacedStabilizer} from "./PlacedStabilizer";
// import {GeneralSet} from "./base/GeneralSet";
//
// class TransitionDetectionEvents {
//     /**
//      * @param {!StabilizerGroup} before
//      * @param {!StabilizerGroup} after
//      * @param {!Array.<!{before: !Array.<!int>, after: !Array.<!int>}>} links
//      */
//     constructor(before, after, links) {
//         this.before = before;
//         this.after = after;
//         this.links = links;
//     }
//
//     add(before)
//
//     /**
//      * @param {!StabilizerGroup} before
//      * @param {!StabilizerGroup} after
//      * @returns {!TransitionDetectionEvents}
//      */
//     fromCommon(before, after) {
//         let links = [];
//         let beforeIndex = new GeneralMap();
//         let afterIndex = new GeneralMap();
//         let used = new GeneralSet();
//
//         for (let n = 1; n < 3; n++) {
//             for (let b of [false, true]) {
//                 let focus = b ? before : after;
//                 let focusIndex = b ? beforeIndex : afterIndex;
//                 let other = !b ? before : after;
//                 let otherIndex = !b ? beforeIndex : afterIndex;
//
//                 function match(ks) {
//                     let product = PlacedStabilizer.product(...ks.map(k => focus.stabilizers[k]));
//                     if (!otherIndex.has(product)) {
//                         return false;
//                     }
//
//                     let ks2 = otherIndex.get(product);
//                     for (let k of ks) {
//                         focusIndex.delete(other.stabilizers[k2]);
//                     }
//
//                     used.add(product);
//                     for (let k of ks) {
//                         focusIndex.delete(other.stabilizers[k2]);
//                     }
//                     for (let k of ks) {
//                         focusIndex.delete(other.stabilizers[k2]);
//                     }
//                     for (let k2 of ks2) {
//                         otherIndex.delete(other.stabilizers[k2]);
//                     }
//                     otherIndex.delete(product);
//                     if (b) {
//                         [ks, ks2] = [ks2, ks];
//                     }
//                     links.push({before: ks, after: ks2});
//                 }
//                 for (let ks of Seq.range(focus.stabilizers.length).combinationsRange(n, n)) {
//                     let product = PlacedStabilizer.product(...ks.map(k => focus.stabilizers[k]));
//                     if (otherIndex.has(product)) {
//                         let ks2 = otherIndex.get(product);
//                         used.add(product);
//                         for (let k of ks) {
//                             focusIndex.delete(other.stabilizers[k2]);
//                         }
//                         for (let k of ks) {
//                             focusIndex.delete(other.stabilizers[k2]);
//                         }
//                         for (let k2 of ks2) {
//                             otherIndex.delete(other.stabilizers[k2]);
//                         }
//                         otherIndex.delete(product);
//                         if (b) {
//                             [ks, ks2] = [ks2, ks];
//                         }
//                         links.push({before: ks, after: ks2});
//                     } else {
//                         focusIndex.set(product, ks);
//                     }
//                 }
//                 for (let i = 0; i < focus.stabilizers.length; i++) {
//                     let s = focus.stabilizers[i];
//                     if (otherIndex.has(s)) {
//                         otherIndex.delete(s);
//                     } else {
//                         focusIndex.set(s, i);
//                     }
//                 }
//         }
//
//         let seen = new GeneralMap();
//         for (let befores of seq(beforeIndex.keys()).combinationsRange(2, 3)) {
//             for (let afters of seq(afterIndex.keys()).combinationsRange(2, 3)) {
//                 if (seq(befores).any(e => seen.has(e))) {
//                     continue;
//                 }
//                 if (seq(afters).any(e => seen.has(e))) {
//                     continue;
//                 }
//                 let product = befores[0];
//                 for (let i = 1; i < befores.length; i++) {
//                     product = product.times
//                 }
//             }
//         }
//
//         return TransitionDetectionEvents(before, after, links);
//     }
// }
//
// /**
//  * @param {!Array.<!T>} items
//  * @param {!int} maxPickCount
//  * @param {!int} skipCount
//  * @yields {!Array.<T>}
//  * @template T
//  */
// function* combinations(items, maxPickCount, skipCount = 0) {
//     if (maxPickCount === 0) {
//         yield [];
//     }
//     for (let i = skipCount; i < items.length; i++) {
//         for (let subCombo of combinations(items, maxPickCount, i + 1)) {
//             subCombo.push(items[i]);
//             yield subCombo;
//             subCombo.pop();
//         }
//     }
// }
//
// export {TransitionDetectionEvents}
