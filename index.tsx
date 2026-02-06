import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";

type Grid = number[][]; // 0 = wall, 1 = floor

function mulberry32(a: number) {
	return function () {
		let t = (a += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const SliderRow: React.FC<{
	label: string;
	value: number;
	min?: number;
	max?: number;
	onChange: (v: number) => void;
}> = ({ label, value, min = 0, max = 100, onChange }) => {
	return (
		<div className="slider-row">
			<label className="slider-label">{label}: <span className="val">{value}</span></label>
			<input
				className="slider-input"
				type="range"
				min={min}
				max={max}
				step={1}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				aria-label={label}
			/>
		</div>
	);
};

function generateDungeon(gridSize: number, roomCount: number, roomMaxSize: number, seed: number): { grid: Grid; rooms: { x: number; y: number; w: number; h: number }[] } {
	const rand = mulberry32(seed);
	const grid: Grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
	const rooms: { x: number; y: number; w: number; h: number }[] = [];

	function carveRoom(x: number, y: number, w: number, h: number) {
		for (let i = x; i < x + w; i++) {
			for (let j = y; j < y + h; j++) {
				if (i >= 0 && j >= 0 && i < gridSize && j < gridSize) grid[j][i] = 1;
			}
		}
	}

	function carveCorridor(ax: number, ay: number, bx: number, by: number) {
		let x = ax;
		let y = ay;
		while (x !== bx) {
			if (x >= 0 && y >= 0 && x < gridSize && y < gridSize) grid[y][x] = 1;
			x += x < bx ? 1 : -1;
		}
		while (y !== by) {
			if (x >= 0 && y >= 0 && x < gridSize && y < gridSize) grid[y][x] = 1;
			y += y < by ? 1 : -1;
		}
	}

	for (let r = 0; r < roomCount; r++) {
		const w = Math.max(2, Math.floor(rand() * roomMaxSize));
		const h = Math.max(2, Math.floor(rand() * roomMaxSize));
		const x = Math.floor(rand() * (gridSize - w));
		const y = Math.floor(rand() * (gridSize - h));
		carveRoom(x, y, w, h);
		const center = { x: Math.floor(x + w / 2), y: Math.floor(y + h / 2), w, h };
		rooms.push(center);
		if (rooms.length > 1) {
			const prev = rooms[rooms.length - 2];
			carveCorridor(prev.x, prev.y, center.x, center.y);
		}
	}

	return { grid, rooms };
}

const App: React.FC = () => {
	const [gridSize, setGridSize] = useState(32);
	const [roomCount, setRoomCount] = useState(8);
	const [roomMaxSize, setRoomMaxSize] = useState(8);
	const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000000));
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [lastGrid, setLastGrid] = useState<Grid | null>(null);

	function regen(withSeed?: number) {
		const s = withSeed ?? seed;
		const { grid } = generateDungeon(gridSize, roomCount, roomMaxSize, s);
		setLastGrid(grid);
		setSeed(s);
		drawGrid(grid);
	}

	function drawGrid(grid: Grid | null) {
		const canvas = canvasRef.current;
		if (!canvas || !grid) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const size = grid.length;
		const tile = Math.max(4, Math.floor(Math.min(400 / size, 12)));
		canvas.width = size * tile;
		canvas.height = size * tile;
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				ctx.fillStyle = grid[y][x] === 1 ? "#e6d7b1" : "#2b2b2b"; // floor, wall
				ctx.fillRect(x * tile, y * tile, tile, tile);
			}
		}
	}

	useEffect(() => {
		regen();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gridSize, roomCount, roomMaxSize]);

	function randomize() {
		const s = Math.floor(Math.random() * 1000000);
		regen(s);
	}

	async function exportJSON() {
		if (!lastGrid) return;
		const payload = { grid: lastGrid, params: { gridSize, roomCount, roomMaxSize, seed } };
		const json = JSON.stringify(payload);
		try {
			await navigator.clipboard.writeText(json);
			alert("JSON copied to clipboard");
		} catch {
			// fallback: download file
			const blob = new Blob([json], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "map.json";
			a.click();
			URL.revokeObjectURL(url);
		}
	}

	return (
		<div className="app">
			<h2>Procedural Generation — Live Preview</h2>
			<div style={{ display: "flex", gap: 20 }}>
				<div style={{ flex: "1 1 320px" }}>
					<div className="sliders">
						<SliderRow label="Grid Size" value={gridSize} min={16} max={64} onChange={setGridSize} />
						<SliderRow label="Room Count" value={roomCount} min={1} max={30} onChange={setRoomCount} />
						<SliderRow label="Room Max Size" value={roomMaxSize} min={3} max={20} onChange={setRoomMaxSize} />
					</div>

					<div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
						<label style={{ display: "flex", gap: 8, alignItems: "center" }}>
							Seed:
							<input value={seed} onChange={(e) => setSeed(Number(e.target.value || 0))} style={{ width: 120 }} />
						</label>
						<button onClick={() => regen(seed)}>Apply Seed</button>
						<button onClick={randomize}>Randomize</button>
						<button onClick={exportJSON}>Export JSON</button>
					</div>
				</div>

				<div style={{ width: 420 }}>
					<canvas ref={canvasRef} style={{ width: "100%", border: "1px solid #ccc" }} />
				</div>
			</div>

			<style>{`
				.app { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial; padding: 20px; max-width: 980px; margin: 24px auto; }
				.sliders { display:flex; flex-direction: column; gap: 12px; }
				.slider-row { display:flex; align-items:center; gap:10px }
				.slider-label { width:140px; font-weight:600 }
				.val { font-weight:700; margin-left:6px }
				.slider-input { width:100%; }
			`}</style>
		</div>
	);
};

const rootEl = document.getElementById("root");
if (rootEl) {
	createRoot(rootEl).render(<App />);
} else {
	console.warn("No #root element found — create an index.html with a div#root to mount the app.");
}

