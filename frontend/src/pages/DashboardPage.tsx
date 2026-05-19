import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Plus, Zap, ChevronRight, Calendar, ChevronDown, ChevronUp,
  AlertTriangle, BookOpen, ClipboardList, Package, GitCompare, Database,
} from "lucide-react";
import { getJobs, createJob } from "../services/api";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import type { Job } from "../types";

// ── 使い方ガイド ──────────────────────────────────────────────────────────────
const STEPS = [
  {
    icon: <Database size={18} className="text-primary" />,
    title: "① 単価マスターを登録",
    desc: "ヘッダーの「単価マスター」から電気材料の材料費・工賃を登録します。記号コード（例: SW-1P）で SymbolHit と紐づきます。",
  },
  {
    icon: <Zap size={18} className="text-primary" />,
    title: "② ジョブを作成",
    desc: "「新規ジョブ」から工事案件を作成します。現場名・会社名・地域コードを入力します。",
  },
  {
    icon: <ClipboardList size={18} className="text-primary" />,
    title: "③ 記号判定タブ — SymbolHit を確認",
    desc: "AI判定結果が一覧表示されます。信頼度が閾値（デフォルト75%）を下回る行は黄色で「要確認」表示されます。候補が複数ある場合は行を展開してラジオ選択で記号を確定し、「承認」で ACCEPTED にします。",
  },
  {
    icon: <ClipboardList size={18} className="text-primary" />,
    title: "④ 見積明細タブ — 見積を生成",
    desc: "「見積を生成」ボタンを押すと ACCEPTED → CONFIRMED、HOLD/UNASSIGNED → PENDING（黄色）として見積明細が自動生成されます。数量・単価・備考は行の鉛筆アイコンで直接編集できます。",
  },
  {
    icon: <Package size={18} className="text-primary" />,
    title: "⑤ 資材発注タブ — メーカー別発注リスト",
    desc: "確定済み明細をメーカー別にグループ化した発注リストを確認できます。",
  },
  {
    icon: <GitCompare size={18} className="text-primary" />,
    title: "⑥ 図面Rev管理タブ — 差分検出",
    desc: "Rev.1 / Rev.2 などを選択して「差分を表示」すると、追加・削除・変更された記号を自動分類します（±5mm 範囲で同一記号と判定）。",
  },
  {
    icon: <Database size={18} className="text-primary" />,
    title: "⑦ Excel / PDF 出力",
    desc: "見積明細タブの「Excel出力」「PDF出力」ボタンから見積書を生成します。Excel はシート1: 明細、シート2: 資材発注、シート3: 未確定リスト の3シート構成です。",
  },
];

function UsageGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-primary/20 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 font-semibold text-primary text-sm">
          <BookOpen size={16} />
          使い方ガイド
        </span>
        {open ? <ChevronUp size={16} className="text-primary" /> : <ChevronDown size={16} className="text-primary" />}
      </button>
      {open && (
        <div className="bg-white px-5 py-4 grid gap-4 sm:grid-cols-2">
          {STEPS.map((s) => (
            <div key={s.title} className="flex gap-3">
              <div className="mt-0.5 shrink-0">{s.icon}</div>
              <div>
                <div className="text-sm font-semibold text-gray-800">{s.title}</div>
                <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────────
export function DashboardPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", site_name: "", company_name: "", region_code: "DEFAULT" });

  const { data: jobs, isLoading, isError } = useQuery({
    queryKey: ["jobs"],
    queryFn: getJobs,
    retry: 1,
  });

  const createMut = useMutation({
    mutationFn: createJob,
    onSuccess: (job) => {
      toast.success("ジョブを作成しました");
      qc.invalidateQueries({ queryKey: ["jobs"] });
      setShowForm(false);
      navigate(`/jobs/${job.id}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "作成に失敗しました", { duration: 6000 });
    },
  });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1>ジョブ一覧</h1>
          <p className="text-gray-500 text-sm mt-0.5">電気記号判定・見積管理</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> 新規ジョブ
        </button>
      </div>

      <UsageGuide />

      {/* バックエンド接続エラーバナー */}
      {isError && (
        <div className="flex gap-3 items-start p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-500" />
          <div>
            <div className="font-semibold mb-1">バックエンドサーバーに接続できません</div>
            <div className="text-xs text-red-700">
              以下のコマンドでサーバーを起動してください：<br />
              <code className="bg-red-100 px-1.5 py-0.5 rounded font-mono">
                cd electrical-symbol-inspector/backend &amp;&amp; uvicorn app.main:app --reload
              </code>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card space-y-4">
          <h2>新規ジョブ作成</h2>
          {[
            { label: "ジョブ名 *", field: "name", placeholder: "例: 〇〇ビル電気工事" },
            { label: "現場名", field: "site_name", placeholder: "例: 〇〇ビル 3F" },
            { label: "会社名", field: "company_name", placeholder: "例: 株式会社○○電気" },
            { label: "地域コード", field: "region_code", placeholder: "DEFAULT" },
          ].map(({ label, field, placeholder }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={placeholder}
                value={(form as Record<string, string>)[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setShowForm(false)}>キャンセル</button>
            <button
              className="btn-primary"
              onClick={() => createMut.mutate(form)}
              disabled={!form.name || createMut.isPending}
            >
              {createMut.isPending ? "作成中..." : "作成"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-3">
          {!isError && jobs?.length === 0 && (
            <div className="card text-center py-12 text-gray-400">
              <Zap size={32} className="mx-auto mb-3 opacity-40" />
              <p>ジョブがまだありません。「新規ジョブ」から作成してください。</p>
            </div>
          )}
          {jobs?.map((job) => (
            <JobCard key={job.id} job={job} onClick={() => navigate(`/jobs/${job.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ job, onClick }: { job: Job; onClick: () => void }) {
  return (
    <button
      className="card w-full text-left hover:border-primary/40 hover:shadow-md transition-all flex items-center justify-between group"
      onClick={onClick}
    >
      <div>
        <div className="font-semibold">{job.name}</div>
        <div className="text-sm text-gray-500 mt-0.5">
          {job.site_name && <span>{job.site_name}</span>}
          {job.company_name && <span className="ml-3">{job.company_name}</span>}
        </div>
        <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <Calendar size={11} />
          {new Date(job.created_at).toLocaleDateString("ja-JP")}
        </div>
      </div>
      <ChevronRight size={20} className="text-gray-300 group-hover:text-primary transition-colors" />
    </button>
  );
}
