# ProcedGen
 Procedural Generation Research
 
## Setup
1. **Install Node.js** (v18+ recommended) or use [nvm-windows](https://github.com/coreybutler/nvm-windows) to manage versions.
2. Open a terminal in the project root and run:
   ```powershell
   npm install
   ```
3. Copy `.env.example` to `.env` and add your Groq API key:
   ```text
   VITE_GROQ_API_KEY=your_real_key_here
   ```
   You can register for a free account and generate a key at https://console.groq.com/keys.
4. Start the development server:
   ```powershell
   npm run dev
   ```
   Open the URL printed by Vite (usually http://localhost:5173) in your browser.

## Using the LLM prompt
A textarea labeled **"Describe a dungeon"** appears under the sliders. Enter a short English description of the dungeon you want (e.g. "a wide corridor with five rooms and a central hub"). Click **Generate from prompt** and the app will send your text to a Groq model, which returns a response.

The frontend now automatically prepends a system instruction asking the model to **begin every reply with a JSON object** containing any of the fields `gridSize`, `roomCount`, `roomMaxSize`, `doorCount`, `keyCount`, `lightLevel`, and `seed`; a natural‑language description may follow. (Light level is constrained to **1–100** – zero isn’t allowed, since the rendering assumes at least a faint torch or glow and the canvas is drawn over a black background.) The visible sliders correspondingly include these six variables, giving you a richer level‑design vocabulary. For example, the prompt:
```
a dark maze with fifteen tiny rooms, five doors, and one key
```
may lead to a response such as:
```
{"gridSize":60,"roomCount":15,"roomMaxSize":3,"doorCount":5,"keyCount":1,"lightLevel":10,"seed":4321}
A claustrophobic series of chambers lit by faint torches…
```
You won’t see the JSON yourself – it’s parsed and applied behind the scenes, and only the description text is displayed. If the model ignores the instruction and returns pure narrative (as in your earlier example), the app falls back to regex searches for numbers labelled "rooms", "doors", "keys", etc., and applies any values it can extract.

You can also explicitly request JSON yourself to guide the behaviour further:
```
Please reply with a JSON object containing gridSize, roomCount, roomMaxSize, and seed. Then describe the dungeon.
```

The JavaScript handles the returned text intelligently: if the reply begins with JSON the app will parse it, update the sliders immediately, and **omit the JSON from what is shown** – only the natural‑language description (if any) is visible. It even strips common backtick wrappers (single or triple, with or without the word `json`) so you don’t accidentally see raw data. The parser tolerates the model returning `gridSize` as a single number or a two‑element array (`[width,height]`), since some prompts elicit that format. That way you don’t see the parameters yourself; they silently drive the map. If the model ignores the instruction and replies purely with prose, the app still tries to extract numbers with a simple regex.

The current implementation uses a plain `fetch` call to the REST endpoint; you can also install and import the official JavaScript client (`npm install groq-sdk`) if you prefer.  The dependency is already listed in `package.json` for convenience.

The response is displayed (sans JSON) below the button. If the model emits valid JSON containing any of the properties `gridSize`, `roomCount`, `roomMaxSize`, `doorCount`, `keyCount`, `lightLevel`, or `seed`, those values will automatically be applied and the dungeon regenerated. This lets you experiment with human‑machine co‑creativity by having the LLM suggest parameters.

> **Note:** the API key is embedded in the frontend for ease of experimentation. In a real application you should proxy requests through a backend to keep the key secret.

