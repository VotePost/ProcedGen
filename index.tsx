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

function generateDungeon(
		gridSize: number,
		roomCount: number,
		roomMaxSize: number,
		doorCount: number,
		keyCount: number,
		lightLevel: number,
		seed: number
): { grid: Grid; rooms: { x: number; y: number; w: number; h: number }[]; metadata: any } {
	const rand = mulberry32(seed);
		// grid values: 0=wall,1=floor,2=door,3=key
		const grid: Grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
		const rooms: { x: number; y: number; w: number; h: number }[] = [];

		function carveRoom(x: number, y: number, w: number, h: number) {
			for (let i = x; i < x + w; i++) {
				for (let j = y; j < y + h; j++) {
					if (i >= 0 && j >= 0 && i < gridSize && j < gridSize) grid[j][i] = 1;
				}
			}
		}
		// grid values: 0=wall,1=floor,2=door,3=key

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

	// randomly place doors and keys on floor tiles
	function placeObjects(count: number, value: number) {
		let placed = 0;
		while (placed < count) {
			const i = Math.floor(rand() * gridSize);
			const j = Math.floor(rand() * gridSize);
			if (grid[j][i] === 1) {
				grid[j][i] = value;
				placed++;
			}
		}
	}
	placeObjects(doorCount, 2);
	placeObjects(keyCount, 3);

	return { grid, rooms, metadata: { lightLevel } };
}

const App: React.FC = () => {
	const [gridSize, setGridSize] = useState(32);
	const [roomCount, setRoomCount] = useState(8);
	const [roomMaxSize, setRoomMaxSize] = useState(8);
	const [doorCount, setDoorCount] = useState(4);
	const [keyCount, setKeyCount] = useState(1);
	const [lightLevel, setLightLevel] = useState(50); // 1=darkest,100=bright
	const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000000));
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [lastGrid, setLastGrid] = useState<Grid | null>(null);

	// states for LLM prompt
	const [prompt, setPrompt] = useState("");
	const [llmResponse, setLlmResponse] = useState<string | null>(null);
	const [isCalling, setIsCalling] = useState(false);

	function regen(withSeed?: number) {
		const s = withSeed ?? seed;
		const { grid } = generateDungeon(
			gridSize,
			roomCount,
			roomMaxSize,
			doorCount,
			keyCount,
			lightLevel,
			s
		);
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
		// adjust global alpha based on lightLevel (retrieved from last draw metadata)
		// draw solid black background before applying transparency; avoids white
		ctx.fillStyle = "#000";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		const light = lightLevel / 100;
		ctx.globalAlpha = light;
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				let color;
				switch (grid[y][x]) {
					case 0:
						color = "#1a0f4e"; // wall
						break;
					case 1:
						color = "#9b7a28"; // floor
						break;
					case 2:
						color = "#663300"; // door
						break;
					case 3:
						color = "#ffff00"; // key
						break;
				default:
					color = "#ff00ff";
				}
				ctx.fillStyle = color;
				ctx.fillRect(x * tile, y * tile, tile, tile);
			}
		}
		ctx.globalAlpha = 1;
	}

	useEffect(() => {
		regen();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gridSize, roomCount, roomMaxSize, doorCount, keyCount, lightLevel]);

	function randomize() {
		const s = Math.floor(Math.random() * 1000000);
		regen(s);
	}

	// Calls Groq chat completion endpoint with a user prompt and returns the assistant text.
	async function callGroq(promptText: string): Promise<string> {
		// Vite exposes environment variables under import.meta.env; cast to any to satisfy TS.
		const key = (import.meta as any).env.VITE_GROQ_API_KEY;
		if (!key) throw new Error("GROQ API key is missing (set VITE_GROQ_API_KEY in .env)");
		const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${key}`,
			},
			body: JSON.stringify({
				model: "openai/gpt-oss-20b",
				messages: [
					{
						role: "system",
						content: `You are an assistant that helps generate dungeon parameters. When responding, \n` +
							`start with a JSON object containing any of these fields: gridSize, roomCount, roomMaxSize, doorCount, keyCount, lightLevel, seed. \n` +
							`You may follow the JSON with a natural-language description. If you cannot supply numbers, ` +
							`just provide the description; the app will try to infer values from it.`,
					},
					{ role: "user", content: promptText },
				],
			}),
		});
		if (!res.ok) {
			const txt = await res.text();
			throw new Error(`Groq request failed ${res.status}: ${txt}`);
		}
		const payload = await res.json();
		return payload.choices?.[0]?.message?.content || "";
	}

	// user pressed generate-from-prompt button
	async function handlePrompt() {
		setIsCalling(true);
		setLlmResponse(null);
		try {
			const response = await callGroq(prompt);

			// clean up common backtick/markdown wrappers the model sometimes adds
			let cleaned = response.trim();
			// remove leading backticks of any length, optionally followed by "json" and a newline
			cleaned = cleaned.replace(/^`+\s*(?:json)?\s*\n?/, "");
			// remove trailing backticks as well
			cleaned = cleaned.replace(/`+\s*$/, "");

			// parse and apply any JSON at the start of the cleaned text
			let displayText = cleaned;
			let applied = false;
			const jsonMatch = cleaned.match(/^\s*(\{[\s\S]*?\})([\s\S]*)$/);
			if (jsonMatch) {
				try {
					const data = JSON.parse(jsonMatch[1]);
					// clamp helper avoids zeros or absurd values from LLM
					const clamp = (v: number, min: number, max: number) =>
						Math.max(min, Math.min(max, v));
					if (typeof data.gridSize === "number") {
						setGridSize(clamp(data.gridSize, 1, 200));
						applied = true;
					} else if (Array.isArray(data.gridSize) && data.gridSize.length > 0) {
						// some replies give [width,height]
						setGridSize(clamp(Number(data.gridSize[0]), 1, 200));
						applied = true;
					}
					if (typeof data.roomCount === "number") {
						setRoomCount(clamp(data.roomCount, 0, 300));
						applied = true;
					}
					if (typeof data.roomMaxSize === "number") {
						setRoomMaxSize(clamp(data.roomMaxSize, 1, 50));
						applied = true;
					}
					if (typeof data.doorCount === "number") {
						setDoorCount(clamp(data.doorCount, 0, 100));
						applied = true;
					}
					if (typeof data.keyCount === "number") {
						setKeyCount(clamp(data.keyCount, 0, 50));
						applied = true;
					}
					if (typeof data.lightLevel === "number") {
						setLightLevel(clamp(data.lightLevel, 0, 100));
						applied = true;
					}
					if (typeof data.seed === "number") {
						setSeed(data.seed);
						applied = true;
					}
					// regeneration will happen via useEffect when states change
				} catch {
					// ignore parse error
				}
				// remove JSON from display text
				displayText = jsonMatch[2].trim() || "";
			}

			// numeric-extraction fallback if model didn't emit JSON
			if (!applied) {
				const nums: Partial<Record<string, number>> = {};
				const roomMatch = response.match(/(\d+)\s*rooms?/i);
				if (roomMatch) nums.roomCount = parseInt(roomMatch[1], 10);
				const gridMatch = response.match(/grid\s*size\s*(\d+)/i);
				if (gridMatch) nums.gridSize = parseInt(gridMatch[1], 10);
				const maxMatch = response.match(/max\s*size\s*(\d+)/i);
				if (maxMatch) nums.roomMaxSize = parseInt(maxMatch[1], 10);
				const doorMatch = response.match(/(\d+)\s*doors?/i);
				if (doorMatch) nums.doorCount = parseInt(doorMatch[1], 10);
				const keyMatch = response.match(/(\d+)\s*keys?/i);
				if (keyMatch) nums.keyCount = parseInt(keyMatch[1], 10);
				const lightMatch = response.match(/light\s*level\s*(\d+)/i);
				if (lightMatch) nums.lightLevel = parseInt(lightMatch[1], 10);
				const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
				if (nums.gridSize !== undefined) setGridSize(clamp(nums.gridSize, 1, 200));
				if (nums.roomCount !== undefined) setRoomCount(clamp(nums.roomCount, 0, 300));
				if (nums.roomMaxSize !== undefined) setRoomMaxSize(clamp(nums.roomMaxSize, 1, 50));
				if (nums.doorCount !== undefined) setDoorCount(clamp(nums.doorCount, 0, 100));
				if (nums.keyCount !== undefined) setKeyCount(clamp(nums.keyCount, 0, 50));
				if (nums.lightLevel !== undefined) setLightLevel(clamp(nums.lightLevel, 1, 100));
				// effect will pick up the changes and regenerate automatically
			}

			setLlmResponse(displayText || response);
		} catch (err: any) {
			setLlmResponse(`Error: ${err.message}`);
		} finally {
			setIsCalling(false);
		}
	}

	async function exportJSON() {
		if (!lastGrid) return;
		const payload = {
			grid: lastGrid,
			params: { gridSize, roomCount, roomMaxSize, doorCount, keyCount, lightLevel, seed },
		};
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
						<SliderRow label="Grid Size" value={gridSize} min={16} max={100} onChange={setGridSize} />
						<SliderRow label="Room Count" value={roomCount} min={1} max={300} onChange={setRoomCount} />
						<SliderRow label="Room Max Size" value={roomMaxSize} min={1} max={20} onChange={setRoomMaxSize} />
						<SliderRow label="Door Count" value={doorCount} min={0} max={100} onChange={setDoorCount} />
						<SliderRow label="Key Count" value={keyCount} min={0} max={10} onChange={setKeyCount} />
						<SliderRow label="Light Level" value={lightLevel} min={1} max={100} onChange={setLightLevel} />
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

					{/* LLM prompt section */}
					<div style={{ marginTop: 20 }}>
						<h3>Describe a dungeon</h3>
						<textarea
							rows={3}
							style={{ width: "100%" }}
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder="e.g. a sprawling cavern with 10 rooms and narrow corridors"
						/>
						<button onClick={handlePrompt} disabled={isCalling || !prompt.trim()}>
							{isCalling ? "Generating…" : "Generate from prompt"}
						</button>
						{llmResponse && (
							<pre style={{ marginTop: 10, background: "#eee", padding: 8, whiteSpace: "pre-wrap" }}>
								{llmResponse}
							</pre>
						)}
					</div>
				</div>

				<div style={{ width: 420 }}>
					<canvas ref={canvasRef} style={{ width: "100%", border: "1px solid #000000" }} />
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

