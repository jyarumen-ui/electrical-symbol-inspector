import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useSymbolStore } from "../../stores/useSymbolStore";
import { getSymbolHits, updateSymbolHit } from "../../services/api";
import { StatusBadge } from "../ui/StatusBadge";
import { ConfidenceBar } from "../ui/ConfidenceBar";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import type { SymbolHit, AiCandidate } from "../../types";

export function SymbolHitsPanel({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const { confidenceThreshold, setThreshold } = useSymbolStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: hits, isLoading } = useQuery({
    queryKey: ["symbol-hits", jobId],
    queryFn: () => getSymbolHits(jobId),
  });

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SymbolHit> }) =>
      updateSymbolHit(id, body),
    onSuccess: () => {
      toast.success("更新しました");
      qc.invalidateQueries({ queryKey: ["symbol-hits", jobId] });
    },
    onError: () => toast.error("更新に失敗しました"),
  });

  const selectCandidate = (hit: SymbolHit, candidate: AiCandidate) => {
    mutation.mutate({ id: hit.id, body: { symbol_code: candidate.symbolCode, status: "ACCEPTED" } });
  };

  const toggleStatus = (hit: SymbolHit) => {
    const next = hit.status === "ACCEPTED" ? "REJECTED"
      : hit.status === "REJECTED" ? "UNASSIGNED"
      : "ACCEPTED";
    mutation.mutate({ id: hit.id, body: { status: next } });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      {/* Threshold slider */}
      <div className="flex items-center gap-4 p-3 bg-white rounded-lg border border-gray-200 text-sm">
        <label className="font-medium text-gray-700 whitespace-nowrap">
          AI信頼度 閾値
        </label>
        <input
          type="range" min={0} max={1} step={0.01}
          value={confidenceThreshold}
          onChange={(e) => setThreshold(+e.target.value)}
          className="flex-1 accent-primary"
        />
        <span className="w-12 text-right font-mono text-primary font-semibold">
          {Math.round(confidenceThreshold * 100)}%
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="table-base">
          <thead>
            <tr>
              <th>記号コード</th>
              <th>ラベル</th>
              <th>AI信頼度</th>
              <th>ステータス</th>
              <th>備考</th>
              <th className="w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {hits?.map((hit) => {
              const isBelowThreshold = (hit.ai_confidence ?? 1) < confidenceThreshold;
              const hasMultipleCandidates = (hit.ai_candidates?.length ?? 0) >= 2;
              const isExpanded = expanded.has(hit.id);

              return (
                <>
                  <tr
                    key={hit.id}
                    className={
                      isBelowThreshold ? "row-pending" :
                      hit.status === "REJECTED" ? "opacity-50" : ""
                    }
                  >
                    <td className="font-mono text-xs">
                      {hit.symbol_code}
                      {isBelowThreshold && (
                        <span className="ml-1 badge-pending badge text-xs">要確認</span>
                      )}
                    </td>
                    <td>{hit.label ?? "—"}</td>
                    <td>
                      {hit.ai_confidence != null ? (
                        <ConfidenceBar value={hit.ai_confidence} threshold={confidenceThreshold} />
                      ) : "—"}
                    </td>
                    <td><StatusBadge status={hit.status} /></td>
                    <td className="text-gray-500 text-xs">{hit.note ?? ""}</td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={() => toggleStatus(hit)}
                        >
                          {hit.status === "ACCEPTED" ? "取消" : "承認"}
                        </button>
                        {hasMultipleCandidates && (
                          <button
                            className="text-xs text-orange-600 hover:underline"
                            onClick={() => setExpanded((s) => {
                              const n = new Set(s);
                              n.has(hit.id) ? n.delete(hit.id) : n.add(hit.id);
                              return n;
                            })}
                          >
                            候補{isExpanded ? "▲" : "▼"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && hit.ai_candidates?.map((c) => (
                    <tr key={c.symbolCode} className="bg-orange-50 text-xs">
                      <td className="pl-8 font-mono">{c.symbolCode}</td>
                      <td>{c.label}</td>
                      <td>
                        <ConfidenceBar value={c.confidence} threshold={confidenceThreshold} />
                      </td>
                      <td colSpan={2} />
                      <td>
                        <button
                          className="text-xs bg-primary text-white px-2 py-0.5 rounded hover:bg-primary-light"
                          onClick={() => selectCandidate(hit, c)}
                        >
                          選択
                        </button>
                      </td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
