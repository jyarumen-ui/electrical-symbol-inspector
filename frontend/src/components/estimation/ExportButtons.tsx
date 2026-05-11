import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { exportExcel, exportPdf } from "../../services/api";

export function ExportButtons({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState<"excel" | "pdf" | null>(null);

  const download = async (type: "excel" | "pdf") => {
    setLoading(type);
    try {
      const res = type === "excel" ? await exportExcel(jobId) : await exportPdf(jobId);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estimation_${jobId}.${type === "excel" ? "xlsx" : "pdf"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${type === "excel" ? "Excel" : "PDF"}を出力しました`);
    } catch {
      toast.error("出力に失敗しました");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        className="btn-secondary"
        onClick={() => download("excel")}
        disabled={loading !== null}
      >
        <FileSpreadsheet size={16} />
        {loading === "excel" ? "生成中..." : "Excel出力"}
      </button>
      <button
        className="btn-secondary"
        onClick={() => download("pdf")}
        disabled={loading !== null}
      >
        <FileText size={16} />
        {loading === "pdf" ? "生成中..." : "PDF出力"}
      </button>
    </div>
  );
}
