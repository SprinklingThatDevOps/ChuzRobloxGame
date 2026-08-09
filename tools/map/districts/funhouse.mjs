import { MATERIAL, NEON, NEON_ORDER, PAINT, shade } from "../palette.mjs";
import { LAYOUT } from "../layout.mjs";

/**
 * The Hall of Borrowed Faces: a real, solvable mirror maze.
 *
 * Walls come from a seeded recursive-backtracker carve, then a second pass
 * knocks out extra walls so the maze has loops. Dead ends are murder; loops
 * are what make it playable.
 */
export function buildFunhouse(b, rng) {
	const { funhouse } = LAYOUT;
	const [cx, , cz] = funhouse.pos;
	const cell = 8;
	const cols = Math.floor(funhouse.width / cell);
	const rows = Math.floor(funhouse.depth / cell);
	const originX = cx - (cols * cell) / 2;
	const originZ = cz - (rows * cell) / 2;
	const wallHeight = 13;
	/** Cell centres and the openings between them, handed back for navigation. */
	const graph = { cells: [], edges: [] };
	const cellIndex = (c, r) => r * cols + c;

	b.inGroup("Funhouse", () => {
		// Chequered floor.
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				b.box({
					name: "FunhouseTile",
					pos: [originX + c * cell + cell / 2, 0.14, originZ + r * cell + cell / 2],
					size: [cell, 0.28, cell],
					color: (r + c) % 2 === 0 ? [24, 20, 32] : [66, 58, 78],
					material: MATERIAL.marble,
					reflectance: 0.15,
				});
			}
		}

		const maze = carveMaze(cols, rows, rng, 0.22);

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				graph.cells.push([originX + c * cell + cell / 2, 2.2, originZ + r * cell + cell / 2]);
			}
		}
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				if (r > 0 && !maze.northWall(c, r)) graph.edges.push([cellIndex(c, r), cellIndex(c, r - 1)]);
				if (c > 0 && !maze.westWall(c, r)) graph.edges.push([cellIndex(c, r), cellIndex(c - 1, r)]);
			}
		}

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const x = originX + c * cell;
				const z = originZ + r * cell;
				if (maze.northWall(c, r)) {
					addMirrorWall(b, rng, [x + cell / 2, wallHeight / 2, z], [cell + 0.4, wallHeight, 0.5]);
				}
				if (maze.westWall(c, r)) {
					addMirrorWall(b, rng, [x, wallHeight / 2, z + cell / 2], [0.5, wallHeight, cell + 0.4]);
				}
			}
		}
		// Outer shell, minus the doorway in the south face.
		const doorCol = Math.floor(cols / 2);
		for (let c = 0; c < cols; c++) {
			const x = originX + c * cell + cell / 2;
			if (c !== doorCol) {
				addMirrorWall(b, rng, [x, wallHeight / 2, originZ + rows * cell], [cell + 0.4, wallHeight, 0.5]);
			}
		}
		for (let r = 0; r < rows; r++) {
			const z = originZ + r * cell + cell / 2;
			addMirrorWall(b, rng, [originX + cols * cell, wallHeight / 2, z], [0.5, wallHeight, cell + 0.4]);
		}

		// Roof with neon light strips between the beams.
		for (let c = 0; c < cols; c++) {
			b.box({
				name: "FunhouseRoof",
				pos: [originX + c * cell + cell / 2, wallHeight + 0.6, cz],
				size: [cell - 0.6, 1.2, rows * cell],
				color: PAINT.plumDark,
				material: MATERIAL.metal,
			});
			if (c % 2 === 0) {
				const color = NEON_ORDER[c % NEON_ORDER.length];
				b.box({
					name: "FunhouseStrip",
					pos: [originX + c * cell + cell / 2, wallHeight - 0.2, cz],
					size: [0.8, 0.4, rows * cell - 2],
					color,
					material: MATERIAL.neon,
					canCollide: false,
					castShadow: false,
				});
				for (let k = -1; k <= 1; k++) {
					b.light({
						pos: [originX + c * cell + cell / 2, wallHeight - 1.5, cz + k * 22],
						color,
						range: 26,
						brightness: 1.1,
						flicker: rng.bool(0.3) ? rng.float(0.1, 0.4) : undefined,
					});
				}
			}
		}

		buildFacade(b, rng, [cx, 0, originZ + rows * cell], cols * cell, doorCol, originX, cell);

		b.landmark("Hall of Borrowed Faces", funhouse.pos, "Every mirror shows someone standing behind you.");
	});

	b.blocker({ type: "rect", center: [cx, cz], size: [funhouse.width + 10, funhouse.depth + 10] });
	// The doorway is the one way in, so nav re-enters through the maze graph.
	graph.door = [originX + Math.floor(cols / 2) * cell + cell / 2, 2.2, originZ + rows * cell + 6];
	return graph;
}

function addMirrorWall(b, rng, pos, size) {
	const mirrored = rng.bool(0.55);
	b.box({
		name: mirrored ? "MirrorPanel" : "MazeWall",
		pos,
		size,
		color: mirrored ? [178, 196, 210] : shade(PAINT.plum, -0.1),
		material: mirrored ? MATERIAL.foil : MATERIAL.wood,
		reflectance: mirrored ? 0.72 : 0.05,
	});
	// Frame trim, so the walls read as panels rather than slabs.
	b.box({
		name: "MirrorTrim",
		pos: [pos[0], size[1] + 0.4, pos[2]],
		size: [size[0] + 0.2, 0.5, size[2] + 0.2],
		color: PAINT.brass,
		material: MATERIAL.metal,
		canCollide: false,
	});
}

function buildFacade(b, rng, doorCentre, width, doorCol, originX, cell) {
	const [fx, , fz] = doorCentre;
	const doorX = originX + doorCol * cell + cell / 2;

	// A vast grinning face whose mouth is the only way in. The head sits high
	// enough that the doorway underneath it stays completely clear.
	const faceY = 31;
	const faceR = 17;
	const mouthTop = 14;

	b.box({
		name: "FacadeBoard",
		pos: [fx, 27, fz + 2.4],
		size: [width + 8, 54, 1.6],
		color: PAINT.plumDark,
		material: MATERIAL.wood,
	});
	b.part({
		name: "FaceDisc",
		shape: "cyl",
		pos: [doorX, faceY, fz + 3.6],
		size: [1.2, faceR * 2, faceR * 2],
		rot: [0, 90, 0],
		color: PAINT.canvasCream,
		material: MATERIAL.smooth,
	});
	for (const side of [-1, 1]) {
		b.part({
			name: "FaceEye",
			shape: "cyl",
			pos: [doorX + side * 8.5, faceY + 4.5, fz + 4.4],
			size: [0.8, 10, 10],
			rot: [0, 90, 0],
			color: [250, 250, 255],
			material: MATERIAL.smooth,
		});
		b.part({
			name: "FacePupil",
			shape: "cyl",
			pos: [doorX + side * (8.5 + 1.6), faceY + 3.8, fz + 5],
			size: [0.7, 4.4, 4.4],
			rot: [0, 90, 0],
			color: NEON.magenta,
			material: MATERIAL.neon,
			castShadow: false,
		});
		b.light({
			pos: [doorX + side * 8.5, faceY + 4.5, fz + 8],
			color: NEON.magenta,
			range: 30,
			brightness: 2.2,
			flicker: 0.2,
		});
		b.box({
			name: "FaceBrow",
			pos: [doorX + side * 8.5, faceY + 10, fz + 4.4],
			size: [11, 1.6, 0.6],
			rot: [0, 0, side * -14],
			color: [40, 24, 50],
			material: MATERIAL.smooth,
			canCollide: false,
		});
	}

	// Upper teeth hang down over the doorway; two lower ones grow up from the
	// threshold so you really do walk between them.
	const teeth = 9;
	for (let i = 0; i < teeth; i++) {
		const t = i / (teeth - 1);
		const offset = (t - 0.5) * 20;
		const drop = 4.6 - Math.abs(t - 0.5) * 4.4;
		b.box({
			name: "FaceTooth",
			pos: [doorX + offset, mouthTop - drop / 2 + 1, fz + 4.6],
			size: [2.1, drop + 2, 0.8],
			color: i % 3 === 1 ? [188, 178, 168] : [250, 246, 236],
			material: MATERIAL.smooth,
			canCollide: false,
		});
	}
	for (const side of [-1, 1]) {
		b.box({
			name: "FaceToothLower",
			pos: [doorX + side * 7, 2, fz + 4.6],
			size: [2.1, 4, 0.8],
			color: [232, 226, 214],
			material: MATERIAL.smooth,
			canCollide: false,
		});
	}
	// The dark of the throat, set back so the doorway reads as a hole.
	b.box({
		name: "MouthDark",
		pos: [doorX, 7, fz + 1.4],
		size: [21, 15, 0.5],
		color: [3, 2, 6],
		material: MATERIAL.smooth,
		canCollide: false,
	});
	for (const side of [-1, 1]) {
		b.box({
			name: "MouthCorner",
			pos: [doorX + side * 11.6, 7.5, fz + 3.2],
			size: [3.4, 16, 2],
			color: PAINT.plumDark,
			material: MATERIAL.wood,
		});
		b.box({
			name: "DoorNeon",
			pos: [doorX + side * 10.2, 7, fz + 4.6],
			size: [0.6, 14, 0.6],
			color: NEON.violet,
			material: MATERIAL.neon,
			canCollide: false,
			castShadow: false,
		});
	}
	b.box({
		name: "FunhouseSign",
		pos: [doorX, 51, fz + 3],
		size: [50, 7, 0.6],
		color: [8, 5, 14],
		material: MATERIAL.smooth,
		sign: { text: "HALL OF BORROWED FACES", color: NEON.violet, face: "Front", scale: 0.8 },
		canCollide: false,
	});

	// Uplighters along the base so the facade is not a black wall at range.
	for (let i = -2; i <= 2; i++) {
		b.box({
			name: "FacadeUplight",
			pos: [fx + i * 22, 1.2, fz + 6],
			size: [3.4, 2, 2.4],
			color: PAINT.ironLight,
			material: MATERIAL.metal,
		});
		b.light({
			pos: [fx + i * 22, 5, fz + 6.5],
			color: i === 0 ? NEON.violet : [206, 176, 255],
			range: 46,
			brightness: 2.2,
		});
	}
	b.light({ pos: [doorX, 10, fz + 14], color: NEON.violet, range: 44, brightness: 2.4 });
}

/**
 * Recursive backtracker with a braid pass.
 * Returns wall queries in grid space.
 */
function carveMaze(cols, rows, rng, braidChance) {
	const north = Array.from({ length: rows }, () => new Array(cols).fill(true));
	const west = Array.from({ length: rows }, () => new Array(cols).fill(true));
	const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));

	const stack = [[Math.floor(cols / 2), rows - 1]];
	visited[rows - 1][Math.floor(cols / 2)] = true;

	while (stack.length > 0) {
		const [c, r] = stack[stack.length - 1];
		const neighbours = [];
		if (r > 0 && !visited[r - 1][c]) neighbours.push(["n", c, r - 1]);
		if (r < rows - 1 && !visited[r + 1][c]) neighbours.push(["s", c, r + 1]);
		if (c > 0 && !visited[r][c - 1]) neighbours.push(["w", c - 1, r]);
		if (c < cols - 1 && !visited[r][c + 1]) neighbours.push(["e", c + 1, r]);

		if (neighbours.length === 0) {
			stack.pop();
			continue;
		}
		const [dir, nc, nr] = rng.pick(neighbours);
		if (dir === "n") north[r][c] = false;
		if (dir === "s") north[r + 1][c] = false;
		if (dir === "w") west[r][c] = false;
		if (dir === "e") west[r][c + 1] = false;
		visited[nr][nc] = true;
		stack.push([nc, nr]);
	}

	// Braid: punch extra holes so players can circle instead of getting cornered.
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (r > 0 && north[r][c] && rng.bool(braidChance)) north[r][c] = false;
			if (c > 0 && west[r][c] && rng.bool(braidChance)) west[r][c] = false;
		}
	}

	return {
		northWall: (c, r) => (r === 0 ? true : north[r][c]),
		westWall: (c, r) => (c === 0 ? true : west[r][c]),
	};
}
