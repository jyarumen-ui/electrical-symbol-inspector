import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Upload, FileText, Image, AlertTriangle, CheckCircle, Loader2, X } from "lucide-react";
import { uploadDrawing } from "../../services/api";
import type { UploadResult } from "../../types";
import { DiagramViewer } from "./DiagramViewer";

interface Props {
  jobId: string;
  uploadResult: UploadResult | null;
  onUploadResult: (r: UploadResult | null) => void;
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

export function DrawingUploadPanel({ jobId, uploadResult: result, onUploadResult: setResult }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadDrawing(jobId, file),
    onSuccess: (data) => {
      setResult(data);
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ["symbol-hits", jobId] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      const msg = e?.response?.data?.detail ?? e?.message ?? "アップロードに失敗しました";
      toast.error(`[${e?.response?.status ?? "ERR"}] ${msg}`, { duration: 12000 });
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

  const reset = () => { setSelectedFile(null); setResult(null); };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">図面アップロード</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          PDF・PNG・JPEG・Excel の図面をアップロードすると、Claude AI が電気記号を自動検出し「記号判定」タブに追加します。
        </p>
      </div>

      {/* ドロップゾーン */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          dragOver ? "border-primary bg-primary/5" : "border-gray-300 hover:border-primary/50 hover:bg-gray-50"
        }`}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !selectedFile && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={onInputChange} />
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

      {/* アップロードボタン */}
      {selectedFile && !result && (
        <div className="flex justify-end">
          <button
            className="btn-primary"
            onClick={() => uploadMut.mutate(selectedFile)}
            disabled={uploadMut.isPending}
          >
            {uploadMut.isPending ? (
              <><Loader2 size={15} className="animate-spin" />解析中...（しばらくお待ちください）</>
            ) : (
              <><Upload size={15} />記号を検出する</>
            )}
          </button>
        </div>
      )}

      {/* 結果 */}
      {result && (
        <div className="space-y-3">
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
            <CheckCircle size={20} className="text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-800">{result.detected} 件の電気記号を検出しました</p>
              <p className="text-sm text-green-700 mt-0.5">「見積明細」タブで「見積を生成」を押してください。</p>
              <button className="mt-2 text-xs text-green-600 underline" onClick={reset}>
                別のファイルをアップロード
              </button>
            </div>
          </div>

          {/* インタラクティブ図面ビューア */}
          {result.page_image && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 flex items-center gap-2 border-b border-gray-200">
                <AlertTriangle size={14} className="text-orange-500" />
                図面確認・手動微調整
                <span className="ml-auto text-xs text-gray-400 font-normal">
                  色付き番号 = 検出記号 | 赤点線 = AI不確定（クリックで除去） | クリック = 手動追加
                </span>
              </div>
              <div className="p-3">
                <DiagramViewer
                  jobId={jobId}
                  pageImage={result.page_image}
                  imgWidth={result.img_width}
                  imgHeight={result.img_height}
                  initialUncertain={result.uncertain}
                  detectedSymbols={result.located_symbols ?? []}
                  onSymbolAdded={() => qc.invalidateQueries({ queryKey: ["symbol-hits", jobId] })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 注意事項 */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex gap-2">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>PDF は各ページを画像変換して解析します。ページ数が多い場合は時間がかかります。</p>
          <p>Excel は埋め込み図面画像を抽出して解析します。テキストのみの Excel には対応していません。</p>
        </div>
      </div>
    </div>
  );
}
