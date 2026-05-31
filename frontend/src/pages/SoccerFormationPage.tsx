import { useEffect, useRef, useState, useCallback } from "react";

// ─── Formation definitions ───────────────────────────────────────────────────
// Each position: [x 0-1, y 0-1]  y=0 own-goal, y=1 opponent-goal
type Pos = [number, number];
interface Formation {
  name: string;
  label: string;
  positions: Pos[]; // index 0 = GK
}

const FORMATIONS: Formation[] = [
  {
    name: "4-2-3-1",
    label: "4-2-3-1",
    positions: [
      [0.5, 0.06],
      [0.18, 0.2],[0.38, 0.18],[0.62, 0.18],[0.82, 0.2],
      [0.35, 0.38],[0.65, 0.38],
      [0.18, 0.56],[0.5, 0.56],[0.82, 0.56],
      [0.5, 0.74],
    ],
  },
  {
    name: "4-3-3",
    label: "4-3-3",
    positions: [
      [0.5, 0.06],
      [0.18, 0.2],[0.38, 0.18],[0.62, 0.18],[0.82, 0.2],
      [0.28, 0.45],[0.5, 0.4],[0.72, 0.45],
      [0.18, 0.74],[0.5, 0.76],[0.82, 0.74],
    ],
  },
  {
    name: "3-4-2-1",
    label: "3-4-2-1",
    positions: [
      [0.5, 0.06],
      [0.28, 0.2],[0.5, 0.18],[0.72, 0.2],
      [0.15, 0.4],[0.38, 0.38],[0.62, 0.38],[0.85, 0.4],
      [0.35, 0.6],[0.65, 0.6],
      [0.5, 0.78],
    ],
  },
  {
    name: "3-3-2-2",
    label: "3-3-2-2",
    positions: [
      [0.5, 0.06],
      [0.28, 0.2],[0.5, 0.18],[0.72, 0.2],
      [0.25, 0.4],[0.5, 0.38],[0.75, 0.4],
      [0.33, 0.58],[0.67, 0.58],
      [0.33, 0.76],[0.67, 0.76],
    ],
  },
  {
    name: "4-4-2",
    label: "4-4-2",
    positions: [
      [0.5, 0.06],
      [0.18, 0.2],[0.38, 0.18],[0.62, 0.18],[0.82, 0.2],
      [0.18, 0.5],[0.38, 0.48],[0.62, 0.48],[0.82, 0.5],
      [0.35, 0.74],[0.65, 0.74],
    ],
  },
  {
    name: "5-3-2",
    label: "5-3-2",
    positions: [
      [0.5, 0.06],
      [0.1, 0.22],[0.28, 0.18],[0.5, 0.16],[0.72, 0.18],[0.9, 0.22],
      [0.28, 0.48],[0.5, 0.44],[0.72, 0.48],
      [0.35, 0.74],[0.65, 0.74],
    ],
  },
];

// ─── Matchup analysis ────────────────────────────────────────────────────────
// Returns per-player advantage score (+ve = team1 player is "free")
function computeMatchup(f1: Formation, f2: Formation) {
  const p1 = f1.positions;
  // Mirror team2 positions: y → 1-y, swap left-right is kept symmetrical
  const p2: Pos[] = f2.positions.map(([x, y]) => [x, 1 - y]);

  const scores1: number[] = p1.map(([x1, y1]) => {
    const dists = p2.map(([x2, y2]) => Math.hypot(x1 - x2, y1 - y2));
    const minD = Math.min(...dists);
    return minD; // large = "free", small = "covered"
  });
  const scores2: number[] = p2.map(([x2, y2]) => {
    const dists = p1.map(([x1, y1]) => Math.hypot(x1 - x2, y1 - y2));
    return Math.min(...dists);
  });

  const avg1 = scores1.reduce((a, b) => a + b, 0) / scores1.length;
  const avg2 = scores2.reduce((a, b) => a + b, 0) / scores2.length;

  return { scores1, scores2, team1Advantage: avg1 - avg2 };
}

// ─── 3-D projection ──────────────────────────────────────────────────────────
function project(
  wx: number, wy: number, wz: number,
  camTheta: number, camPhi: number, camDist: number,
  cx: number, cy: number, scale: number
): [number, number, number] {
  // Rotate around vertical axis (theta) then tilt (phi)
  const cosT = Math.cos(camTheta), sinT = Math.sin(camTheta);
  const cosP = Math.cos(camPhi), sinP = Math.sin(camPhi);

  const rx = wx * cosT - wy * sinT;
  const ry = wx * sinT + wy * cosT;
  const rz = wz;

  const ex = rx;
  const ey = ry * cosP - rz * sinP;
  const ez = ry * sinP + rz * cosP - camDist;

  const f = scale / (-ez);
  const sx = cx + ex * f;
  const sy = cy - ey * f;
  const depth = -ez;
  return [sx, sy, depth];
}

// ─── Color helpers ───────────────────────────────────────────────────────────
function scoreColor(score: number, maxScore: number): string {
  const t = Math.min(score / maxScore, 1);
  const r = Math.round(220 * t + 50 * (1 - t));
  const g = Math.round(50 * t + 220 * (1 - t));
  return `rgb(${r},${g},60)`;
}

// ─── Main component ──────────────────────────────────────────────────────────
export function SoccerFormationPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const thetaRef = useRef(Math.PI * 0.15);
  const autoRotateRef = useRef(true);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const [f1idx, setF1idx] = useState(0);
  const [f2idx, setF2idx] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);
  const [phi, setPhi] = useState(0.55); // tilt
  const [showLabels, setShowLabels] = useState(true);
  const [activeAngle, setActiveAngle] = useState<string>("斜め");

  const phiRef = useRef(phi);
  phiRef.current = phi;

  const ANGLES: Record<string, { theta: number; phi: number; label: string }> = {
    "真上": { theta: Math.PI * 0.15, phi: Math.PI / 2, label: "真上（俯瞰）" },
    "斜め": { theta: Math.PI * 0.15, phi: 0.55, label: "斜め45°" },
    "横": { theta: Math.PI * 0.15, phi: 0.15, label: "横から" },
    "正面": { theta: Math.PI * 0.5, phi: 0.45, label: "正面から" },
  };

  // Sync autoRotate ref
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const f1 = FORMATIONS[f1idx];
    const f2 = FORMATIONS[f2idx];
    const { scores1, scores2 } = computeMatchup(f1, f2);
    const maxScore = Math.max(...scores1, ...scores2, 0.01);

    const camTheta = thetaRef.current;
    const camPhi = phiRef.current;
    const camDist = 4.5;
    const scale = Math.min(W, H) * 0.65;
    const cx = W / 2;
    const cy = H / 2;

    // Field dimensions: world space  -1..1 x, -1.5..1.5 y, z=0
    const fw = 2, fl = 3;

    const proj = (wx: number, wy: number, wz = 0) =>
      project(wx, wy, wz, camTheta, camPhi, camDist, cx, cy, scale);

    // ── Draw grass field ──
    const fieldCorners: [number, number][] = [
      [-fw / 2, -fl / 2], [fw / 2, -fl / 2],
      [fw / 2, fl / 2], [-fw / 2, fl / 2],
    ];
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      const y0 = -fl / 2 + (fl / stripes) * i;
      const y1 = y0 + fl / stripes;
      const corners: [number, number][] = [
        [-fw / 2, y0],[fw / 2, y0],[fw / 2, y1],[-fw / 2, y1],
      ];
      ctx.beginPath();
      corners.forEach(([wx, wy], idx) => {
        const [sx, sy] = proj(wx, wy);
        idx === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? "#2d7a2d" : "#267326";
      ctx.fill();
    }

    // Field border
    ctx.beginPath();
    fieldCorners.forEach(([wx, wy], idx) => {
      const [sx, sy] = proj(wx, wy);
      idx === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Centre line
    const [cl0x, cl0y] = proj(-fw / 2, 0);
    const [cl1x, cl1y] = proj(fw / 2, 0);
    ctx.beginPath();
    ctx.moveTo(cl0x, cl0y);
    ctx.lineTo(cl1x, cl1y);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Centre circle (approximate with line segments)
    const cr = 0.3;
    ctx.beginPath();
    for (let a = 0; a <= 2 * Math.PI; a += 0.2) {
      const [sx, sy] = proj(Math.cos(a) * cr, Math.sin(a) * cr * (fl / fw));
      a === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Penalty areas
    for (const side of [-1, 1]) {
      const py = side * fl / 2;
      const pdy = side * -0.5;
      const pax: [number, number][] = [
        [-0.45, py],[0.45, py],[0.45, py + pdy],[-0.45, py + pdy],
      ];
      ctx.beginPath();
      pax.forEach(([wx, wy], idx) => {
        const [sx, sy] = proj(wx, wy);
        idx === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // ── Draw players ──
    // Convert formation pos [0-1,0-1] → world coords
    // Team 1: y in [0,1] maps to world y in [-1.5, 0] (bottom half)
    // Team 2: y in [0,1] maps to world y in [0, 1.5] (top half, mirrored)
    const toWorld1 = (p: Pos): [number, number] => [
      (p[0] - 0.5) * fw,
      (p[1] - 0.5) * -fl / 2 + (-fl / 4),
    ];
    const toWorld2 = (p: Pos): [number, number] => {
      const [wx, wy] = toWorld1([p[0], 1 - p[1]]);
      return [wx, -wy];
    };

    type DrawPlayer = {
      sx: number; sy: number; depth: number;
      color: string; teamColor: string;
      label: string; score: number;
    };

    const allPlayers: DrawPlayer[] = [];

    f1.positions.forEach((p, i) => {
      const [wx, wy] = toWorld1(p);
      const [sx, sy, depth] = proj(wx, wy, 0.04);
      allPlayers.push({
        sx, sy, depth,
        color: scoreColor(scores1[i], maxScore),
        teamColor: "#3b82f6",
        label: i === 0 ? "GK" : `${i}`,
        score: scores1[i],
      });
    });

    f2.positions.forEach((p, i) => {
      const [wx, wy] = toWorld2(p);
      const [sx, sy, depth] = proj(wx, wy, 0.04);
      allPlayers.push({
        sx, sy, depth,
        color: scoreColor(scores2[i], maxScore),
        teamColor: "#ef4444",
        label: i === 0 ? "GK" : `${i}`,
        score: scores2[i],
      });
    });

    // Depth sort
    allPlayers.sort((a, b) => b.depth - a.depth);

    const baseR = Math.min(W, H) * 0.028;

    allPlayers.forEach(({ sx, sy, depth, color, teamColor, label }) => {
      const r = baseR * Math.min(1.2, 4 / depth);

      // Shadow
      ctx.beginPath();
      ctx.ellipse(sx, sy + r * 0.3, r * 0.8, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fill();

      // Glow ring (advantage indicator)
      ctx.beginPath();
      ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = color + "80";
      ctx.fill();

      // Team color circle
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = teamColor;
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Jersey icon highlight
      ctx.beginPath();
      ctx.arc(sx, sy - r * 0.25, r * 0.45, Math.PI, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fill();

      // Label - rendered outside circle to avoid overlap
      if (showLabels) {
        const labelY = sy - r - 5;
        ctx.font = `bold ${Math.round(r * 0.75)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        // Background pill
        const tw = ctx.measureText(label).width + 6;
        const th = r * 0.85;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.roundRect(sx - tw / 2, labelY - th, tw, th, 3);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.fillText(label, sx, labelY);
      }
    });
  }, [f1idx, f2idx, showLabels]);

  // Animation loop
  useEffect(() => {
    let last = 0;
    const loop = (ts: number) => {
      if (autoRotateRef.current) {
        thetaRef.current += (ts - last) * 0.0003;
      }
      last = ts;
      draw();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // Canvas resize
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement!;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Pointer / touch drag for manual rotation ──
  const onPointerDown = (e: React.PointerEvent) => {
    autoRotateRef.current = false;
    setAutoRotate(false);
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    thetaRef.current += dx * 0.008;
    const newPhi = Math.max(0.1, Math.min(Math.PI / 2, phiRef.current - dy * 0.006));
    setPhi(newPhi);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => { dragRef.current = null; };

  const setAngle = (key: string) => {
    const a = ANGLES[key];
    thetaRef.current = a.theta;
    setPhi(a.phi);
    setActiveAngle(key);
    autoRotateRef.current = false;
    setAutoRotate(false);
  };

  const { team1Advantage } = computeMatchup(FORMATIONS[f1idx], FORMATIONS[f2idx]);
  const adv = team1Advantage;
  const advText =
    Math.abs(adv) < 0.02
      ? "互角"
      : adv > 0
      ? `${FORMATIONS[f1idx].label} 有利`
      : `${FORMATIONS[f2idx].label} 有利`;
  const advColor =
    Math.abs(adv) < 0.02 ? "text-yellow-400" : adv > 0 ? "text-blue-400" : "text-red-400";

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-2rem)] bg-gray-900 text-white select-none">
      {/* ── Top controls ── */}
      <div className="flex flex-col sm:flex-row gap-2 px-3 pt-3 pb-2 bg-gray-800 shadow z-10">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: "#3b82f6" }}
          />
          <select
            className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1.5 min-w-0"
            value={f1idx}
            onChange={(e) => setF1idx(Number(e.target.value))}
          >
            {FORMATIONS.map((f, i) => (
              <option key={f.name} value={i}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-center font-bold text-gray-400 text-sm px-1">VS</div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: "#ef4444" }}
          />
          <select
            className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1.5 min-w-0"
            value={f2idx}
            onChange={(e) => setF2idx(Number(e.target.value))}
          >
            {FORMATIONS.map((f, i) => (
              <option key={f.name} value={i}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Advantage badge ── */}
      <div className="flex items-center justify-center gap-3 py-1.5 bg-gray-850 border-b border-gray-700">
        <span className="text-xs text-gray-400">判定:</span>
        <span className={`font-bold text-sm ${advColor}`}>{advText}</span>
        <span className="text-xs text-gray-500">
          {Math.abs(adv) < 0.02 ? "" : `(差 ${Math.abs(adv * 100).toFixed(0)}pts)`}
        </span>
      </div>

      {/* ── Canvas ── */}
      <div
        className="flex-1 relative cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Legend – pinned bottom-left, outside canvas drawing area */}
        <div className="absolute bottom-2 left-2 bg-black/60 rounded-lg px-2.5 py-2 text-xs space-y-1 pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
            <span className="text-gray-200">{FORMATIONS[f1idx].label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            <span className="text-gray-200">{FORMATIONS[f2idx].label}</span>
          </div>
          <div className="flex items-center gap-1.5 pt-0.5 border-t border-white/10">
            <span className="w-3 h-3 rounded inline-block" style={{ background: "rgb(50,220,60)" }} />
            <span className="text-gray-300">フリー（有利）</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded inline-block" style={{ background: "rgb(220,50,60)" }} />
            <span className="text-gray-300">マークされている</span>
          </div>
        </div>
      </div>

      {/* ── Bottom toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-t border-gray-700 overflow-x-auto">
        <span className="text-xs text-gray-400 flex-shrink-0">視点:</span>
        {Object.entries(ANGLES).map(([key, a]) => (
          <button
            key={key}
            onClick={() => setAngle(key)}
            className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${
              activeAngle === key
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {a.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => {
            autoRotateRef.current = !autoRotate;
            setAutoRotate((v) => !v);
          }}
          className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${
            autoRotate ? "bg-green-700 text-white" : "bg-gray-700 text-gray-300"
          }`}
        >
          {autoRotate ? "⏸ 自動回転" : "▶ 自動回転"}
        </button>
        <button
          onClick={() => setShowLabels((v) => !v)}
          className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${
            showLabels ? "bg-gray-600 text-white" : "bg-gray-700 text-gray-400"
          }`}
        >
          番号 {showLabels ? "ON" : "OFF"}
        </button>
      </div>

      {/* ── Drag hint ── */}
      <p className="text-center text-[10px] text-gray-500 pb-1 bg-gray-800">
        ドラッグ / スワイプで視点を変更できます
      </p>
    </div>
  );
}
