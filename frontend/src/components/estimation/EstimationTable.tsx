import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Pencil, Check, X } from "lucide-react";
import type { EstimationItem } from "../../types";
import { updateEstimationItem } from "../../services/api";
import { StatusBadge } from "../ui/StatusBadge";

const fmt = (n: number) => n.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

interface Props {
  items: EstimationItem[];
  jobId: string;
}

export function EstimationTable({ items, jobId }: Props) {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<EstimationItem>>({});

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<EstimationItem> }) =>
      updateEstimationItem(id, body),
    onSuccess: () => {
      toast.success("更新しました");
      qc.invalidateQueries({ queryKey: ["estimation", jobId] });
      setEditId(null);
    },
    onError: () => toast.error("更新に失敗しました"),
  });

  const startEdit = (item: EstimationItem) => {
    setEditId(item.id);
    setEditValues({ quantity: item.quantity, unit_price: item.unit_price, note: item.note ?? "" });
  };

  const commitEdit = (id: string) => mutation.mutate({ id, body: editValues });

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="table-base">
        <thead>
          <tr>
            <th>記号コード</th>
            <th>品名</th>
            <th>メーカー</th>
            <th>型番</th>
            <th className="text-right">数量</th>
            <th>単位</th>
            <th className="text-right">単価 (円)</th>
            <th className="text-right">金額 (円)</th>
            <th>ステータス</th>
            <th>備考</th>
            <th className="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isPending = item.status === "PENDING";
            const isEditing = editId === item.id;
            return (
              <tr key={item.id} className={isPending ? "row-pending" : ""}>
                <td className="font-mono text-xs">{item.symbol_code}</td>
                <td>
                  {item.item_name}
                  {isPending && (
                    <span className="ml-1 badge-pending badge text-xs">要確認</span>
                  )}
                </td>
                <td className="text-gray-600">{item.maker ?? "—"}</td>
                <td className="text-gray-600 font-mono text-xs">{item.model_number ?? "—"}</td>
                <td className="text-right">
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-20 text-right border rounded px-1 py-0.5 text-sm"
                      value={editValues.quantity ?? ""}
                      onChange={(e) => setEditValues((v) => ({ ...v, quantity: +e.target.value }))}
                    />
                  ) : (
                    item.quantity
                  )}
                </td>
                <td>{item.unit}</td>
                <td className="text-right">
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-24 text-right border rounded px-1 py-0.5 text-sm"
                      value={editValues.unit_price ?? ""}
                      onChange={(e) => setEditValues((v) => ({ ...v, unit_price: +e.target.value }))}
                    />
                  ) : (
                    fmt(item.unit_price)
                  )}
                </td>
                <td className="text-right font-semibold">{fmt(item.amount)}</td>
                <td><StatusBadge status={item.status} /></td>
                <td>
                  {isEditing ? (
                    <input
                      type="text"
                      className="w-32 border rounded px-1 py-0.5 text-sm"
                      value={editValues.note ?? ""}
                      onChange={(e) => setEditValues((v) => ({ ...v, note: e.target.value }))}
                    />
                  ) : (
                    <span className="text-gray-500 text-xs">{item.note ?? ""}</span>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <div className="flex gap-1">
                      <button onClick={() => commitEdit(item.id)} className="text-green-600 hover:text-green-800">
                        <Check size={14} />
                      </button>
                      <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(item)} className="text-gray-400 hover:text-primary">
                      <Pencil size={14} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
