/**
 * Footprints on the shelf grid: every good is a rectangle, named by its width and height in cells ("2x3").
 * Cells are [x, y] from the top-left of the bounding box.
 */
export type ShapeId = `${number}x${number}`;

export interface Shape {
  cells: readonly (readonly [number, number])[];
  w: number;
  h: number;
}

const rect = (w: number, h: number): Shape => {
  const cells: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push([x, y]);
  return { cells, w, h };
};

const MAX = 6;
/** Every footprint up to six cells a side. */
export const SHAPES: Record<ShapeId, Shape> = {};
/** Every footprint in its four orientations: index 0 as drawn, then one quarter turn clockwise each. */
export const ROTATED: Record<ShapeId, Shape[]> = {};
for (let w = 1; w <= MAX; w++) {
  for (let h = 1; h <= MAX; h++) {
    const id: ShapeId = `${w}x${h}`;
    SHAPES[id] = rect(w, h);
    ROTATED[id] = [rect(w, h), rect(h, w), rect(w, h), rect(h, w)];
  }
}
/** Two orientations look the same when they cover the same cells (a square never changes; a bar has two looks). */
export const sameCells = (a: Shape, b: Shape): boolean => a.w === b.w && a.h === b.h;
