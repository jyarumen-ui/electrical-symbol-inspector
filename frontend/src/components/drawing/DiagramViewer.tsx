import { useRef, useState, useCallback, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { X, Plus, Check, Eye, EyeOff } from "lucide-react";
import type { UncertainMark, LocatedSymbol } from "../../types";
import { createSymbolHit } from "../../services/api";

// 記号ごとに割り当てるカラーパレット（20色）
const PALETTE = [
  "#1d4ed8", "#dc2626", "#16a34a", "#d97706", "#7c3aed",
  "#0891b2", "#be185d", "#b45309", "#c2410c", "#4f46e5",
  "#0f766e", "#9333ea", "#ca8a04", "#1e40af", "#166534",
  "#92400e", "#6d28d9", "#0369a1", "#b91c1c", "#065f46",
];

const LABELS: Record<string, string> = {
  "SW-1P": "単極SW", "SW-3P": "3路SW", "SW-4P": "4路SW", "SW-WP": "防水SW",
  "RCPT-2P": "2口RCPT", "RCPT-E": "アースRCPT", "RCPT-WP": "防水RCPT", "RCPT-20A": "20ARCPT",
  "LIGHT-F40": "蛍光40W", "LIGHT-F20": "蛍光20W", "LIGHT-LED": "LED", "LIGHT-DL": "DL", "LIGHT-EX": "非常灯",
  "BRK-20A": "BRK20A", "BRK-30A": "BRK30A", "BRK-50A": "BRK50A",
  "LEAK-20A": "ELB20A", "LEAK-30A": "ELB30A",
  "PANEL-100A": "分電盤100A", "PANEL-60A": "分電盤60A",
  "EV-CHG": "EV充電", "AC-UNIT": "AC室内", "AC-OUT": "AC室外",
  "SENSOR-PIR": "人感", "SMOKE": "煙感", "FIRE-ALM": "発信機",
  "PHONE": "電話", "LAN": "LAN",
  "CABLE-CV2": "CV2", "CABLE-CV5.5": "CV5.5", "CABLE-CV8": "CV8",
  "CABLE-VVF": "VVF", "CONDUIT-16": "管16", "CONDUIT-28": "管28", "CONDUIT-36": "管36",
  "UNKNOWN": "不明",
};

const SYMBOL_CODES = Object.entries(LABELS).map(([code, label]) => ({ code, label }));

interface PendingMark { id: string; svgX: number; svgY: number }

interface Props {
  jobId: string;
  pageImage: string;
  imgWidth: number;
  imgHeight: number;
  initialUncertain?: UncertainMark[];
  detectedSymbols?: LocatedSymbol[];
  onSymbolAdded?: () => void;
}

export function DiagramViewer({
  jobId, pageImage, imgWidth, imgHeight,
  initialUncertain, detectedSymbols, onSymbolAdded,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [uncertain, setUncertain] = useState<UncertainMark[]>(initialUncertain ?? []);
  const [pendingMark, setPendingMark] = useState<PendingMark | null>(null);
  const [selectedCode, setSelectedCode] = useState("SW-1P");
  const [showMarkers, setShowMarkers] = useState(true);

  const safeDetected = detectedSymbols ?? [];

  // 記号コードごとに色を割り当て
  const codeColors = useMemo(() => {
    const codes = [...new Set(safeDetected.map((s) => s.symbol_code))].sort();
    const map: Record<string, string> = {};
    codes.forEach((code, i) => { map[code] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [detectedSymbols]);

  // 記号コードごとに連番を付与
  const numberedSymbols = useMemo(() => {
    const counters: Record<string, number> = {};
    return safeDetected.map((s) => {
      counters[s.symbol_code] = (counters[s.symbol_code] ?? 0) + 1;
      return { ...s, n: counters[s.symbol_code] };
    });
  }, [detectedSymbols]);

  // 凡例データ
  const legend = useMemo(() => {
    const groups: Record<string, { label: string; color: string; count: number }> = {};
    for (const s of safeDetected) {
      if (!groups[s.symbol_code]) {
        groups[s.symbol_code] = {
          label: LABELS[s.symbol_code] ?? s.symbol_code,
          color: codeColors[s.symbol_code] ?? "#666",
          count: 0,
        };
      }
      groups[s.symbol_code].count++;
    }
    return Object.entries(groups).map(([code, v]) => ({ code, ...v }));
  }, [detectedSymbols, codeColors]);

  const addMut = useMutation({
    mutationFn: (body: { jobId: string; symbolCode: string; x: number; y: number }) =>
      createSymbolHit({
        job_id: body.jobId,
        symbol_code: body.symbolCode,
        label: LABELS[body.symbolCode] ?? body.symbolCode,
        x: body.x,
        y: body.y,
        status: "ACCEPTED",
      }),
    onSuccess: () => {
      toast.success("記号を追加しました");
      setPendingMark(null);
      onSymbolAdded?.();
    },
    onError: () => toast.error("追加に失敗しました"),
  });

  const getSvgCoords = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const onSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).closest("[data-marker]")) return;
    const coords = getSvgCoords(e);
    if (!coords) return;
    setPendingMark({ id: `pm-${Date.now()}`, svgX: coords.x, svgY: coords.y });
  }, [getSvgCoords]);

  const vw = imgWidth || 1600;
  const vh = imgHeight || 900;
  // 記号サイズに合わせた円半径（図面サイズに比例）
  const R = Math.max(10, Math.round(vw / 80));
  const FS = Math.max(9, Math.round(R * 0.85));

  return (
    <div className="space-y-2">
      {/* コントロールバー */}
      <div className="flex items-center gap-4 px-1 text-xs text-gray-500 flex-wrap">
        <button
          className="flex items-center gap-1.5 font-medium text-gray-700 hover:text-primary"
          onClick={() => setShowMarkers((v) => !v)}
        >
          {showMarkers ? <Eye size={14} /> : <EyeOff size={14} />}
          {showMarkers ? "マーカー表示中" : "マーカー非表示"}
        </button>
        <span className="text-gray-300">|</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-red-500 bg-red-100" />
          AI不確定（クリックで除去）
        </span>
        <span className="text-gray-300">|</span>
        <span>図面をクリック → 記号を手動追加</span>
      </div>

      {/* SVG 図面 */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${vw} ${vh}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full cursor-crosshair"
          style={{ maxHeight: "70vh" }}
          onClick={onSvgClick}
        >
          <image
            href={`data:image/jpeg;base64,${pageImage}`}
            x={0} y={0} width={vw} height={vh}
          />

          {/* 検出記号マーカー（色付き・番号付き） */}
          {showMarkers && numberedSymbols.map((sym, i) => {
            const color = codeColors[sym.symbol_code] ?? "#666";
            return (
              <g key={i} data-marker="detected">
                <circle
                  cx={sym.x} cy={sym.y} r={R}
                  fill={`${color}30`}
                  stroke={color}
                  strokeWidth={Math.max(1.5, R * 0.14)}
                />
                <text
                  x={sym.x} y={sym.y + FS * 0.38}
                  textAnchor="middle"
                  fontSize={FS}
                  fill={color}
                  fontWeight="800"
                  style={{ userSelect: "none" }}
                >
                  {sym.n}
                </text>
                <title>{sym.symbol_code}（{LABELS[sym.symbol_code] ?? ""}）#{sym.n}</title>
              </g>
            );
          })}

          {/* AI不確定マーカー（赤丸・クリックで除去） */}
          {uncertain.map((u) => (
            <g
              key={u.id}
              data-marker="uncertain"
              style={{ cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); setUncertain((p) => p.filter((x) => x.id !== u.id)); }}
            >
              <circle cx={u.x} cy={u.y} r={R + 2} fill="rgba(239,68,68,0.15)" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" />
              <text x={u.x} y={u.y + FS * 0.38} textAnchor="middle" fontSize={FS + 1} fill="#ef4444" fontWeight="800" style={{ userSelect: "none" }}>?</text>
              <title>{u.reason || "判断に迷った箇所 — クリックで除去"}</title>
            </g>
          ))}

          {/* 手動追加予定マーカー（青点線） */}
          {pendingMark && (
            <g data-marker="pending">
              <circle cx={pendingMark.svgX} cy={pendingMark.svgY} r={R + 2} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 3" />
              <text x={pendingMark.svgX} y={pendingMark.svgY + FS * 0.38} textAnchor="middle" fontSize={FS + 1} fill="#3b82f6" fontWeight="800" style={{ userSelect: "none" }}>+</text>
            </g>
          )}
        </svg>
      </div>

      {/* 手動追加パネル */}
      {pendingMark && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center gap-2">
          <Plus size={14} className="text-blue-600 shrink-0" />
          <span className="text-sm font-medium text-blue-800">追加する記号：</span>
          <select
            className="border border-blue-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
          >
            {SYMBOL_CODES.map((s) => (
              <option key={s.code} value={s.code}>{s.code} — {s.label}</option>
            ))}
          </select>
          <button
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            onClick={() => addMut.mutate({ jobId, symbolCode: selectedCode, x: pendingMark.svgX, y: pendingMark.svgY })}
            disabled={addMut.isPending}
          >
            <Check size={13} />追加
          </button>
          <button
            className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-gray-700 text-sm"
            onClick={() => setPendingMark(null)}
          >
            <X size={13} />キャンセル
          </button>
          <span className="text-xs text-gray-400 ml-auto">
            座標 ({Math.round(pendingMark.svgX)}, {Math.round(pendingMark.svgY)})
          </span>
        </div>
      )}

      {/* 凡例 */}
      {showMarkers && legend.length > 0 && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <p className="text-xs font-semibold text-gray-600 mb-2">記号凡例</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {legend.map(({ code, label, color, count }) => (
              <div key={code} className="flex items-center gap-1.5 text-xs">
                <span
                  className="inline-block w-4 h-4 rounded-full border-2 flex-shrink-0"
                  style={{ borderColor: color, backgroundColor: `${color}30` }}
                />
                <span className="font-mono font-semibold" style={{ color }}>{code}</span>
                <span className="text-gray-500">{label}</span>
                <span className="font-bold" style={{ color }}>×{count}</span>
              </div>
            ))}
            {uncertain.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="inline-block w-4 h-4 rounded-full border-2 flex-shrink-0 border-dashed border-red-500 bg-red-100" />
                <span className="text-red-600 font-medium">AI不確定</span>
                <span className="font-bold text-red-600">×{uncertain.length}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
