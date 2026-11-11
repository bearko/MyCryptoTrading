/** Footprints on the shelf grid. Cells are [x, y] from the top-left of the bounding box. */
export type ShapeId = 's1' | 'v2' | 'h2' | 'v3' | 'sq' | 'l3' | 't4';

export interface Shape {
  cells: readonly (readonly [number, number])[];
  w: number;
  h: number;
}

const make = (cells: [number, number][]): Shape => ({
  cells,
  w: Math.max(...cells.map((c) => c[0])) + 1,
  h: Math.max(...cells.map((c) => c[1])) + 1,
});

export const SHAPES: Record<ShapeId, Shape> = {
  s1: make([[0, 0]]),
  v2: make([[0, 0], [0, 1]]),
  h2: make([[0, 0], [1, 0]]),
  v3: make([[0, 0], [0, 1], [0, 2]]),
  sq: make([[0, 0], [1, 0], [0, 1], [1, 1]]),
  l3: make([[0, 0], [0, 1], [1, 1]]),
  t4: make([[0, 0], [1, 0], [2, 0], [1, 1]]),
};

/** The same footprint turned a quarter turn clockwise. */
const turn = (shape: Shape): Shape => make(shape.cells.map(([x, y]) => [shape.h - 1 - y, x] as [number, number]));
/** Every footprint in its four orientations: index 0 as drawn, then one quarter turn clockwise each. */
export const ROTATED: Record<ShapeId, Shape[]> = Object.fromEntries(
  Object.entries(SHAPES).map(([id, shape]) => [id, [shape, turn(shape), turn(turn(shape)), turn(turn(turn(shape)))]]),
) as Record<ShapeId, Shape[]>;
/** Two orientations look the same when they cover the same cells (a square never changes; a bar has two looks). */
export const sameCells = (a: Shape, b: Shape): boolean => {
  const key = (s: Shape): string => s.cells.map(([x, y]) => `${x},${y}`).sort().join(' ');
  return key(a) === key(b);
};
