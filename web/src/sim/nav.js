/**
 * Navigation over the graph baked into MapData.
 *
 * Line of sight is approximated by walking the straight line between two
 * points and checking that it stays inside the walkable graph -- if a sample
 * lands far from every node, something solid is in the way. That is accurate
 * enough for bot decisions and costs nothing compared to raycasting geometry.
 */
export class NavMesh {
	constructor(nav) {
		this.nodes = nav.nodes.map((n) => n.pos);
		this.adjacency = this.nodes.map(() => []);
		for (const [a, bIndex] of nav.edges) {
			const cost = distance(this.nodes[a], this.nodes[bIndex]);
			this.adjacency[a].push({ to: bIndex, cost });
			this.adjacency[bIndex].push({ to: a, cost });
		}

		this.cell = 16;
		this.grid = new Map();
		for (let i = 0; i < this.nodes.length; i++) {
			const key = this.key(this.nodes[i][0], this.nodes[i][2]);
			let list = this.grid.get(key);
			if (!list) {
				list = [];
				this.grid.set(key, list);
			}
			list.push(i);
		}
	}

	key(x, z) {
		return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
	}

	nearest(pos) {
		let best = -1;
		let bestDist = Infinity;
		const cx = Math.floor(pos[0] / this.cell);
		const cz = Math.floor(pos[2] / this.cell);
		for (let radius = 0; radius <= 6 && best < 0; radius++) {
			for (let ix = cx - radius; ix <= cx + radius; ix++) {
				for (let iz = cz - radius; iz <= cz + radius; iz++) {
					if (radius > 0 && Math.abs(ix - cx) !== radius && Math.abs(iz - cz) !== radius) continue;
					const list = this.grid.get(`${ix},${iz}`);
					if (!list) continue;
					for (const index of list) {
						const d = distance(this.nodes[index], pos);
						if (d < bestDist) {
							bestDist = d;
							best = index;
						}
					}
				}
			}
		}
		return best;
	}

	distanceToGraph(x, z) {
		const cx = Math.floor(x / this.cell);
		const cz = Math.floor(z / this.cell);
		let best = Infinity;
		for (let ix = cx - 1; ix <= cx + 1; ix++) {
			for (let iz = cz - 1; iz <= cz + 1; iz++) {
				const list = this.grid.get(`${ix},${iz}`);
				if (!list) continue;
				for (const index of list) {
					const dx = this.nodes[index][0] - x;
					const dz = this.nodes[index][2] - z;
					const d = Math.sqrt(dx * dx + dz * dz);
					if (d < best) best = d;
				}
			}
		}
		return best;
	}

	hasLineOfSight(from, to, maxDistance = Infinity) {
		const dx = to[0] - from[0];
		const dz = to[2] - from[2];
		const length = Math.sqrt(dx * dx + dz * dz);
		if (length > maxDistance) return false;
		const steps = Math.max(2, Math.ceil(length / 6));
		for (let i = 1; i < steps; i++) {
			const t = i / steps;
			const x = from[0] + dx * t;
			const z = from[2] + dz * t;
			if (this.distanceToGraph(x, z) > 11) return false;
		}
		return true;
	}

	/** A* between graph nodes; returns a list of waypoints. */
	findPath(fromPos, toPos) {
		const start = this.nearest(fromPos);
		const goal = this.nearest(toPos);
		if (start < 0 || goal < 0) return [];
		if (start === goal) return [this.nodes[goal]];

		const open = new MinHeap();
		const gScore = new Map([[start, 0]]);
		const cameFrom = new Map();
		open.push(start, distance(this.nodes[start], this.nodes[goal]));
		const closed = new Set();

		let guard = 0;
		while (open.size > 0 && guard++ < 20000) {
			const current = open.pop();
			if (current === goal) break;
			if (closed.has(current)) continue;
			closed.add(current);

			for (const edge of this.adjacency[current]) {
				const tentative = gScore.get(current) + edge.cost;
				if (tentative < (gScore.get(edge.to) ?? Infinity)) {
					gScore.set(edge.to, tentative);
					cameFrom.set(edge.to, current);
					open.push(edge.to, tentative + distance(this.nodes[edge.to], this.nodes[goal]));
				}
			}
		}

		if (!cameFrom.has(goal) && start !== goal) return [];
		const path = [this.nodes[goal]];
		let cursor = goal;
		while (cameFrom.has(cursor)) {
			cursor = cameFrom.get(cursor);
			path.push(this.nodes[cursor]);
		}
		path.reverse();
		return path;
	}

	randomNode(random) {
		return this.nodes[Math.floor(random() * this.nodes.length)];
	}
}

export function distance(a, b) {
	const dx = a[0] - b[0];
	const dy = (a[1] ?? 0) - (b[1] ?? 0);
	const dz = a[2] - b[2];
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distanceXZ(a, b) {
	const dx = a[0] - b[0];
	const dz = a[2] - b[2];
	return Math.sqrt(dx * dx + dz * dz);
}

class MinHeap {
	constructor() {
		this.items = [];
	}

	get size() {
		return this.items.length;
	}

	push(value, priority) {
		this.items.push({ value, priority });
		let i = this.items.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (this.items[parent].priority <= this.items[i].priority) break;
			[this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
			i = parent;
		}
	}

	pop() {
		const top = this.items[0];
		const last = this.items.pop();
		if (this.items.length > 0) {
			this.items[0] = last;
			let i = 0;
			for (;;) {
				const left = i * 2 + 1;
				const right = left + 1;
				let smallest = i;
				if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) smallest = left;
				if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) smallest = right;
				if (smallest === i) break;
				[this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
				i = smallest;
			}
		}
		return top.value;
	}
}
