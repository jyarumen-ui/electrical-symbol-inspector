import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Minus, RefreshCw } from "lucide-react";
import { diffRevisions, getRevisions } from "../../services/api";
import { LoadingSpinner } from "../ui/LoadingSpinner";

export function RevisionDiffView({ jobId }: { jobId: string }) {
  const [revA, setRevA] = useState("");
  const [revB, setRevB] = useState("");
  const [run, setRun] = useState(false);

  const { data: revisions } = useQuery({
    queryKey: ["revisions", jobId],
    queryFn: () => getRevisions(jobId),
  });

  const { data: diff, isLoading } = useQuery({
    queryKey: ["diff", jobId, revA, revB],
    queryFn: () => diffRevisions(jobId, revA, revB),
    enabled: run && !!revA && !!revB && revA !== revB,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">比較元 Rev</label>
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={revA}
            onChange={(e) => { setRevA(e.target.value); setRun(false); }}
          >
            <option value="">選択してください</option>
            {revisions?.map((r) => (
              <option key={r.id} value={r.id}>{r.rev_number}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">比較先 Rev</label>
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={revB}
            onChange={(e) => { setRevB(e.target.value); setRun(false); }}
          >
            <option value="">選択してください</option>
            {revisions?.map((r) => (
              <option key={r.id} value={r.id}>{r.rev_number}</option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary"
          disabled={!revA || !revB || revA === revB}
          onClick={() => setRun(true)}
        >
          <RefreshCw size={15} />
          差分を表示
        </button>
      </div>

      {isLoading && <LoadingSpinner label="差分を計算中..." />}

      {diff && (
        <div className="space-y-4">
          {/* Summary chips */}
          <div className="flex gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-semibold">
              <Plus size={14} /> 追加 +{diff.summary.added_count}
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-semibold">
              <Minus size={14} /> 削除 -{diff.summary.removed_count}
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-sm font-semibold">
              <RefreshCw size={14} /> 変更 ~{diff.summary.changed_count}
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-sm">
              変更なし {diff.unchanged_count}件
            </span>
          </div>

          {/* Detail tables */}
          {diff.added.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-green-700 mb-1">追加された記号</h4>
              <div className="overflow-x-auto rounded border border-green-200">
                <table className="table-base">
                  <thead><tr><th>記号コード</th><th>ID</th></tr></thead>
                  <tbody>
                    {diff.added.map((r) => (
                      <tr key={r.id} className="bg-green-50">
                        <td className="font-mono text-xs">{r.symbol_code}</td>
                        <td className="text-gray-400 text-xs">{r.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {diff.removed.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-red-700 mb-1">削除された記号</h4>
              <div className="overflow-x-auto rounded border border-red-200">
                <table className="table-base">
                  <thead><tr><th>記号コード</th><th>ID</th></tr></thead>
                  <tbody>
                    {diff.removed.map((r) => (
                      <tr key={r.id} className="bg-red-50">
                        <td className="font-mono text-xs">{r.symbol_code}</td>
                        <td className="text-gray-400 text-xs">{r.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {diff.changed.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-orange-700 mb-1">変更された記号</h4>
              <div className="overflow-x-auto rounded border border-orange-200">
                <table className="table-base">
                  <thead><tr><th>変更前コード</th><th></th><th>変更後コード</th></tr></thead>
                  <tbody>
                    {diff.changed.map((r) => (
                      <tr key={r.from_id} className="bg-orange-50">
                        <td className="font-mono text-xs text-red-700">{r.from_code}</td>
                        <td className="text-gray-400">→</td>
                        <td className="font-mono text-xs text-green-700">{r.to_code}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
