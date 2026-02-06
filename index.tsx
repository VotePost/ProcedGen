import React, { useState } from "react";
import { createRoot } from "react-dom/client";

const SliderRow: React.FC<{
	label: string;
	value: number;
	onChange: (v: number) => void;
}> = ({ label, value, onChange }) => {
	return (
		<div className="slider-row">
			<label className="slider-label">{label}: <span className="val">{value}</span></label>
			<input
				className="slider-input"
				type="range"
				min={0}
				max={100}
				step={1}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				aria-label={label}
			/>
		</div>
	);
};

const App: React.FC = () => {
	const [s1, setS1] = useState(50);
	const [s2, setS2] = useState(25);
	const [s3, setS3] = useState(75);

	return (
		<div className="app">
			<h2>Horizontal Sliders</h2>
			<div className="sliders">
				<SliderRow label="Slider 1" value={s1} onChange={setS1} />
				<SliderRow label="Slider 2" value={s2} onChange={setS2} />
				<SliderRow label="Slider 3" value={s3} onChange={setS3} />
			</div>

			<style>{`
				.app {
					font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
					padding: 24px;
					max-width: 720px;
					margin: 40px auto;
					color: #111;
				}
				.sliders {
					display: flex;
					flex-direction: column;
					gap: 18px;
				}
				.slider-row {
					display: flex;
					align-items: center;
					gap: 12px;
				}
				.slider-label {
					width: 110px;
					font-weight: 600;
				}
				.val {
					font-weight: 700;
					margin-left: 6px;
				}
				.slider-input {
					-webkit-appearance: none;
					appearance: none;
					width: 100%;
					height: 6px;
					background: #e6e6e6;
					border-radius: 4px;
					outline: none;
				}
				.slider-input::-webkit-slider-thumb {
					-webkit-appearance: none;
					appearance: none;
					width: 18px;
					height: 18px;
					border-radius: 50%;
					background: #0078d4;
					cursor: pointer;
					box-shadow: 0 1px 3px rgba(0,0,0,0.3);
				}
				.slider-input::-moz-range-thumb {
					width: 18px;
					height: 18px;
					border-radius: 50%;
					background: #0078d4;
					cursor: pointer;
				}
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

