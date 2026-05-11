import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, Zap, ClipboardList, Package, GitCompare, Upload } from "lucide-react";
import { getJob, getEstimationSummary, generateEstimation } from "../services/api";
import { EstimationTable } from "../components/estimation/EstimationTable";
import { EstimationTotals } from "../components/estimation/EstimationTotals";
import { ExportButtons } from "../components/estimation/ExportButtons";
import { MaterialOrderList } from "../components/estimation/MaterialOrderList";
import { SymbolHitsPanel } from "../components/estimation/SymbolHitsPanel";
import { RevisionDiffView } from "../components/revision/RevisionDiffView";
import { DrawingUploadPanel } from "../components/drawing/DrawingUploadPanel";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";

type Tab = "upload" | "symbols" | "estimation" | "materials" | "revisions";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "upload", label: "図面アップロード", icon: <Upload size={15} /> },
  { id: "symbols", label: "記号判定", icon: <Zap size={15} /> },
  { id: "estimation", label: "見積明細", icon: <ClipboardList size={15} /> },
  { id: "materials", label: "資材発注", icon: <Package size={15} /> },
  { id: "revisions", label: "図面Rev管理", icon: <GitCompare size={15} /> },
];

export function JobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("upload");

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["estimation", jobId],
    queryFn: () => getEstimationSummary(jobId!),
    enabled: !!jobId && tab === "estimation",
  });

  const generateMut = useMutation({
    mutationFn: () => generateEstimation(jobId!),
    onSuccess: (res) => {
      toast.success(`見積を生成しました（${res.generated}件）`);
      qc.invalidateQueries({ queryKey: ["estimation", jobId] });
    },
    onError: () => toast.error("見積生成に失敗しました"),
  });

  if (jobLoading) return <LoadingSpinner />;
  if (!job) return <div className="p-8 text-red-500">ジョブが見つかりません</div>;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link to="/" className="mt-1 text-gray-400 hover:text-primary">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1>{job.name}</h1>
          <p className="text-sm text-gray-500">
            {job.site_name} {job.company_name && `— ${job.company_name}`}
          </p>
        </div>
        {tab === "estimation" && (
          <div className="flex items-center gap-2">
            <button
              className="btn-primary"
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
            >
              <Zap size={15} />
              {generateMut.isPending ? "生成中..." : "見積を生成"}
            </button>
            {summary && <ExportButtons jobId={jobId!} />}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {tab === "upload" && <DrawingUploadPanel jobId={jobId!} />}

        {tab === "symbols" && <SymbolHitsPanel jobId={jobId!} />}

        {tab === "estimation" && (
          summaryLoading ? <LoadingSpinner /> :
          !summary ? (
            <div className="card text-center py-12 text-gray-400">
              <ClipboardList size={32} className="mx-auto mb-3 opacity-40" />
              <p>見積が生成されていません。「見積を生成」ボタンを押してください。</p>
            </div>
          ) : (
            <div className="space-y-5">
              {summary.pending_items.length > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  ⚠️ 未確定項目が {summary.pending_items.length} 件あります。確認・修正が必要です。
                </div>
              )}
              <h3>確定項目（{summary.confirmed_items.length}件）</h3>
              <EstimationTable items={summary.confirmed_items} jobId={jobId!} />
              {summary.pending_items.length > 0 && (
                <>
                  <h3 className="flex items-center gap-2">
                    未確定項目
                    <span className="badge-pending badge">{summary.pending_items.length}件</span>
                  </h3>
                  <EstimationTable items={summary.pending_items} jobId={jobId!} />
                </>
              )}
              <EstimationTotals summary={summary} />
            </div>
          )
        )}

        {tab === "materials" && (
          summaryLoading ? <LoadingSpinner /> :
          !summary ? (
            <div className="card text-center py-8 text-gray-400">
              見積を先に生成してください
            </div>
          ) : (
            <MaterialOrderList items={summary.confirmed_items} />
          )
        )}

        {tab === "revisions" && <RevisionDiffView jobId={jobId!} />}
      </div>
    </div>
  );
}
