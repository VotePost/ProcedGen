import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";

type Grid = number[][]; // 0=wall, 1=floor, 2=door, 3=key, 4=weak enemy, 5=hazard, 6=medium enemy, 7=strong enemy

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
    enemyCount: number,
    hazardCount: number,
    lightLevel: number,
    seed: number
): { grid: Grid; rooms: { x: number; y: number; w: number; h: number }[]; metadata: any } {
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

    // randomly place objects on floor tiles (1)
    function placeObjects(count: number, value: number) {
        let placed = 0;
        let attempts = 0; // prevent infinite loops if map is too small
        while (placed < count && attempts < count * 10) {
            const i = Math.floor(rand() * gridSize);
            const j = Math.floor(rand() * gridSize);
            if (grid[j][i] === 1) {
                grid[j][i] = value;
                placed++;
            }
            attempts++;
        }
    }
    
    placeObjects(doorCount, 2);
    placeObjects(keyCount, 3);
    
    // Collect door positions
    const doorPositions: { x: number; y: number }[] = [];
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            if (grid[y][x] === 2) {
                doorPositions.push({ x, y });
            }
        }
    }
    
    // Place enemies with levels based on distance to nearest door
    function placeEnemies(count: number) {
        let placed = 0;
        let attempts = 0;
        while (placed < count && attempts < count * 10) {
            const i = Math.floor(rand() * gridSize);
            const j = Math.floor(rand() * gridSize);
            if (grid[j][i] === 1) {
                // Calculate min Euclidean distance to any door
                let minDist = Infinity;
                for (const door of doorPositions) {
                    const dist = Math.sqrt((i - door.x) ** 2 + (j - door.y) ** 2);
                    if (dist < minDist) minDist = dist;
                }
                let enemyLevel = 4; // weak
                if (minDist < 5) enemyLevel = 7; // strong
                else if (minDist < 10) enemyLevel = 6; // medium
                grid[j][i] = enemyLevel;
                placed++;
            }
            attempts++;
        }
    }
    
    placeEnemies(enemyCount);
    placeObjects(hazardCount, 5);

    return { grid, rooms, metadata: { lightLevel } };
}

const App: React.FC = () => {
    const [gridSize, setGridSize] = useState(32);
    const [roomCount, setRoomCount] = useState(8);
    const [roomMaxSize, setRoomMaxSize] = useState(8);
    const [doorCount, setDoorCount] = useState(4);
    const [keyCount, setKeyCount] = useState(1);
    const [enemyCount, setEnemyCount] = useState(3);
    const [hazardCount, setHazardCount] = useState(5);
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
            enemyCount,
            hazardCount,
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
        
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const light = lightLevel / 100;
        ctx.globalAlpha = light;
        
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let color;
                switch (grid[y][x]) {
                    case 0: color = "#1a0f4e"; break; // wall
                    case 1: color = "#9b7a28"; break; // floor
                    case 2: color = "#663300"; break; // door
                    case 3: color = "#ffff00"; break; // key
                    case 4: color = "#ff0000"; break; // weak enemy
                    case 5: color = "#00aaff"; break; // hazard/water
                    case 6: color = "#ff6600"; break; // medium enemy
                    case 7: color = "#990000"; break; // strong enemy
                    default: color = "#ff00ff";
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
    }, [gridSize, roomCount, roomMaxSize, doorCount, keyCount, enemyCount, hazardCount, lightLevel]);

    function randomize() {
        const s = Math.floor(Math.random() * 1000000);
        regen(s);
    }

    function exportJson() {
        if (!lastGrid) return;
        const data = JSON.stringify({ 
            prompt: prompt || "Manual Generation",
            parameters: {
                gridSize,
                roomCount,
                roomMaxSize,
                doorCount,
                keyCount,
                enemyCount,
                hazardCount,
                lightLevel
            },
            seed: seed,
            grid: lastGrid 
        }, null, 2);
        
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dungeon-${seed}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function callGroq(promptText: string): Promise<string> {
        const key = (import.meta as any).env.VITE_GROQ_API_KEY;
        if (!key) throw new Error("GROQ API key is missing (set VITE_GROQ_API_KEY in .env)");
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant", // Ensure you are using a valid Groq model
                messages: [
                    {
                        role: "system",
                        content: `You are an assistant that helps generate dungeon parameters. When responding, \n` +
                            `start with a JSON object containing any of these fields: gridSize, roomCount, roomMaxSize, doorCount, keyCount, enemyCount, hazardCount, lightLevel, seed. \n` +
                            `Important calibration rules: \n` +
                            `- lightLevel is 1 to 100 (1 is pitch black, 50 is moderately dim/dark, 100 is fully bright). \n` +
                            `- enemyCount sets how many enemies are in the dungeon. \n` +
                            `- hazardCount sets the amount of water/lava/rubble. \n` +
                            `You may follow the JSON with a natural-language description.`,
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

    async function handlePrompt() {
        setIsCalling(true);
        setLlmResponse(null);
        try {
            const response = await callGroq(prompt);
            let cleaned = response.trim();
            cleaned = cleaned.replace(/^`+\s*(?:json)?\s*\n?/, "");
            cleaned = cleaned.replace(/`+\s*$/, "");

            let displayText = cleaned;
            let applied = false;
            const jsonMatch = cleaned.match(/^\s*(\{[\s\S]*?\})([\s\S]*)$/);
            
            if (jsonMatch) {
                try {
                    const data = JSON.parse(jsonMatch[1]);
                    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
                    const appliedParams: string[] = [];
                    
                    if (typeof data.gridSize === "number") { setGridSize(clamp(data.gridSize, 1, 200)); appliedParams.push(`Grid: ${data.gridSize}`); }
                    if (typeof data.roomCount === "number") { setRoomCount(clamp(data.roomCount, 0, 300)); appliedParams.push(`Rooms: ${data.roomCount}`); }
                    if (typeof data.roomMaxSize === "number") { setRoomMaxSize(clamp(data.roomMaxSize, 1, 50)); appliedParams.push(`Room Size: ${data.roomMaxSize}`); }
                    if (typeof data.doorCount === "number") { setDoorCount(clamp(data.doorCount, 0, 100)); appliedParams.push(`Doors: ${data.doorCount}`); }
                    if (typeof data.keyCount === "number") { setKeyCount(clamp(data.keyCount, 0, 50)); appliedParams.push(`Keys: ${data.keyCount}`); }
                    if (typeof data.enemyCount === "number") { setEnemyCount(clamp(data.enemyCount, 0, 100)); appliedParams.push(`Enemies: ${data.enemyCount}`); }
                    
                    // Handle hazardCount as either a number or an object (sum values)
                    if (typeof data.hazardCount === "number") { 
                        setHazardCount(clamp(data.hazardCount, 0, 100)); 
                        appliedParams.push(`Hazards: ${data.hazardCount}`);
                    } else if (typeof data.hazardCount === "object" && data.hazardCount !== null) {
                        const total = Object.values(data.hazardCount).reduce((sum: number, val: any) => sum + (typeof val === "number" ? val : 0), 0);
                        setHazardCount(clamp(total, 0, 100));
                        appliedParams.push(`Hazards: ${total}`);
                    }
                    
                    if (typeof data.lightLevel === "number") { setLightLevel(clamp(data.lightLevel, 0, 100)); appliedParams.push(`Light: ${data.lightLevel}`); }
                    if (typeof data.seed === "number") { setSeed(data.seed); appliedParams.push(`Seed: ${data.seed}`); }
                    
                    if (appliedParams.length > 0) {
                        applied = true;
                        displayText = `Applied: ${appliedParams.join(", ")}\n\n${jsonMatch[2].trim()}`.trim();
                    }
                } catch {
                    // ignore parse error
                }
                displayText = displayText || jsonMatch[2].trim() || "";
            }

            if (!applied) {
                const nums: Partial<Record<string, number>> = {};
                const roomMatch = response.match(/(\d+)\s*rooms?/i); if (roomMatch) nums.roomCount = parseInt(roomMatch[1], 10);
                const gridMatch = response.match(/grid\s*size\s*(\d+)/i); if (gridMatch) nums.gridSize = parseInt(gridMatch[1], 10);
                const enemyMatch = response.match(/(\d+)\s*enemies?/i); if (enemyMatch) nums.enemyCount = parseInt(enemyMatch[1], 10);
                                const hazardMatch = response.match(/(\d+)\s*hazards?/i); if (hazardMatch) nums.hazardCount = parseInt(hazardMatch[1], 10);
                                
                                if (Object.keys(nums).length > 0) {
                                    if (nums.gridSize !== undefined) setGridSize(Math.max(1, Math.min(200, nums.gridSize)));
                                    if (nums.roomCount !== undefined) setRoomCount(Math.max(0, Math.min(300, nums.roomCount)));
                                    if (nums.enemyCount !== undefined) setEnemyCount(Math.max(0, Math.min(100, nums.enemyCount)));
                                    if (nums.hazardCount !== undefined) setHazardCount(Math.max(0, Math.min(100, nums.hazardCount)));
                                    applied = true;
                                }
                            }
                
                            setLlmResponse(displayText || (applied ? "Parameters updated!" : "No parameters found in response."));
                        } catch (err) {
                            setLlmResponse(`Error: ${err instanceof Error ? err.message : String(err)}`);
                        } finally {
                            setIsCalling(false);
                        }
                    }
                
                    return (
                        <div className="app-container">
                            <div className="sidebar">
                                <h1>Procedural Dungeon Generator</h1>
                                <div className="controls">
                                    <SliderRow label="Grid Size" value={gridSize} min={8} max={200} onChange={setGridSize} />
                                    <SliderRow label="Room Count" value={roomCount} min={1} max={50} onChange={setRoomCount} />
                                    <SliderRow label="Room Max Size" value={roomMaxSize} min={2} max={50} onChange={setRoomMaxSize} />
                                    <SliderRow label="Door Count" value={doorCount} min={0} max={100} onChange={setDoorCount} />
                                    <SliderRow label="Key Count" value={keyCount} min={0} max={50} onChange={setKeyCount} />
                                    <SliderRow label="Enemy Count" value={enemyCount} min={0} max={100} onChange={setEnemyCount} />
                                    <SliderRow label="Hazard Count" value={hazardCount} min={0} max={100} onChange={setHazardCount} />
                                    <SliderRow label="Light Level" value={lightLevel} min={1} max={100} onChange={setLightLevel} />
                                </div>
                                <div className="button-group">
                                    <button onClick={randomize}>Randomize</button>
                                    <button onClick={exportJson}>Export JSON</button>
                                </div>
                            </div>
                            <div className="main-content">
                                <div className="canvas-section">
                                    <canvas ref={canvasRef} />
                                    <div className="legend">
                                        <h3>Key</h3>
                                        <div className="legend-items">
                                            <div className="legend-item">
                                                <div className="color-box" style={{ backgroundColor: "#1a0f4e" }}></div>
                                                <span>Wall</span>
                                            </div>
                                            <div className="legend-item">
                                                <div className="color-box" style={{ backgroundColor: "#9b7a28" }}></div>
                                                <span>Floor</span>
                                            </div>
                                            <div className="legend-item">
                                                <div className="color-box" style={{ backgroundColor: "#663300" }}></div>
                                                <span>Door</span>
                                            </div>
                                            <div className="legend-item">
                                                <div className="color-box" style={{ backgroundColor: "#ffff00" }}></div>
                                                <span>Key</span>
                                            </div>
                                               <div className="legend-item">
                                                <div className="color-box" style={{ backgroundColor: "#00aaff" }}></div>
                                                <span>Hazard</span>
                                            </div>
                                            <div className="legend-item">
                                                <div className="color-box" style={{ backgroundColor: "#ff0000" }}></div>
                                                <span>Weak Enemy</span>
                                            </div>
                                         
                                            <div className="legend-item">
                                                <div className="color-box" style={{ backgroundColor: "#ff6600" }}></div>
                                                <span>Medium Enemy</span>
                                            </div>
                                            <div className="legend-item">
                                                <div className="color-box" style={{ backgroundColor: "#990000" }}></div>
                                                <span>Strong Enemy</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="llm-section">
                                    <h2>Generate with AI</h2>
                                    <textarea
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="Describe your ideal dungeon..."
                                    />
                                    <button onClick={handlePrompt} disabled={isCalling || !prompt.trim()}>
                                        {isCalling ? "Calling AI..." : "Generate"}
                                    </button>
                                    {llmResponse && <div className="response">{llmResponse}</div>}
                                </div>
                            </div>
                        </div>
                    );
                };
                
                const root = createRoot(document.getElementById("root")!);
                root.render(<App />);