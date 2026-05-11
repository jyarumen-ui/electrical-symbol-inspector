import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Upload, FileText, Image, AlertTriangle, CheckCircle, Loader2, X } from "lucide-react";
import { uploadDrawing } from "../../services/api";

interface Props {
  jobId: string;
}

const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.xlsx,.xls";
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function fileIcon(file: File) {
  if (file.type === "application/pdf") return <FileText size={18} className="text-red-500" />;
  if (file.type.startsWith("image/")) return <Image size={18} className="text-blue-500" />;
  return <FileText size={18} className="text-green-600" />;
}

export function DrawingUploadPanel({ jobId }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ detected: number; filename: string } | null>(null);

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadDrawing(jobId, file),
    onSuccess: (data) => {
      setResult(data);
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ["symbol-hits", jobId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "アップロードに失敗しました", { duration: 8000 });
    },
  });

  const handleFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.has(file.type)) {
      toast.error("対応していないファイル形式です。PDF / PNG / JPEG / Excel を使用してください。");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("ファイルサイズが50MBを超えています");
      return;
    }
    setSelectedFile(file);
    setResult(null);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const reset = () => {
    setSelectedFile(null);
    setResult(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">図面アップロード</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          PDF・PNG・JPEG・Excel の図面をアップロードすると、Claude AI が電気記号を自動検出し「記号判定」タブに追加します。
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-gray-300 hover:border-primary/50 hover:bg-gray-50"
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !selectedFile && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={onInputChange}
        />

        {!selectedFile ? (
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Upload size={40} className="opacity-50" />
            <div>
              <p className="font-medium text-gray-600">ファイルをドロップ、またはクリックして選択</p>
              <p className="text-xs mt-1">PDF / PNG / JPEG / Excel（最大 50MB）</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            {fileIcon(selectedFile)}
            <div className="text-left">
              <p className="font-medium text-gray-700 text-sm">{selectedFile.name}</p>
              <p className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              className="ml-4 text-gray-400 hover:text-red-500 transition-colors"
              onClick={(e) => { e.stopPropagation(); reset(); }}
            >
              <X size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Upload button */}
      {selectedFile && !result && (
        <div className="flex justify-end">
          <button
            className="btn-primary"
            onClick={() => uploadMut.mutate(selectedFile)}
            disabled={uploadMut.isPending}
          >
            {uploadMut.isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                解析中...（しばらくお待ちください）
              </>
            ) : (
              <>
                <Upload size={15} />
                記号を検出する
              </>
            )}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
          <CheckCircle size={20} className="text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">
              {result.detected} 件の電気記号を検出しました
            </p>
            <p className="text-sm text-green-700 mt-0.5">
              「記号判定」タブで内容を確認・承認してから見積を生成してください。
            </p>
            <button className="mt-2 text-xs text-green-600 underline" onClick={reset}>
              別のファイルをアップロード
            </button>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex gap-2">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            <strong>環境変数が必要です。</strong>{" "}
            バックエンドの <code className="bg-amber-100 px-1 rounded">.env</code> に{" "}
            <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> を設定してください。
          </p>
          <p>
            PDF は各ページを画像変換して解析します。ページ数が多い場合は時間がかかります。
          </p>
          <p>
            Excel は埋め込み図面画像を抽出して解析します。テキストのみの Excel には対応していません。
          </p>
        </div>
      </div>
    </div>
  );
}
