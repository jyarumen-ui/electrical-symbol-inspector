import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Pencil, Check, X } from "lucide-react";
import { getMasterItems, createMasterItem, updateMasterItem } from "../../services/api";
import type { MasterItem } from "../../types";
import { LoadingSpinner } from "../ui/LoadingSpinner";

const fmt = (n: number) => n.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

const BLANK: Partial<MasterItem> = {
  symbol_code: "", item_name: "", maker: "", model_number: "", grade: "",
  unit: "個", material_cost: 0, labor_cost: 0, region_code: "DEFAULT",
  valid_from: new Date().toISOString().split("T")[0],
};

export function MasterItemsTable() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Partial<MasterItem>>(BLANK);

  const { data: items, isLoading } = useQuery({
    queryKey: ["master-items"],
    queryFn: () => getMasterItems(),
  });

  const createMut = useMutation({
    mutationFn: createMasterItem,
    onSuccess: () => { toast.success("登録しました"); qc.invalidateQueries({ queryKey: ["master-items"] }); setEditId(null); },
    onError: () => toast.error("登録に失敗しました"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<MasterItem> }) => updateMasterItem(id, body),
    onSuccess: () => { toast.success("更新しました"); qc.invalidateQueries({ queryKey: ["master-items"] }); setEditId(null); },
    onError: () => toast.error("更新に失敗しました"),
  });

  if (isLoading) return <LoadingSpinner />;

  const commit = () => {
    if (editId === "new") createMut.mutate(form);
    else if (editId) updateMut.mutate({ id: editId, body: form });
  };

  const startEdit = (item: MasterItem) => { setEditId(item.id); setForm(item); };
  const startNew = () => { setEditId("new"); setForm(BLANK); };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={startNew}>
          <Plus size={15} /> 新規登録
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="table-base">
          <thead>
            <tr>
              <th>記号コード</th>
              <th>品名</th>
              <th>メーカー</th>
              <th>型番</th>
              <th>単位</th>
              <th className="text-right">材料費</th>
              <th className="text-right">工賃</th>
              <th>地域</th>
              <th>有効開始</th>
              <th>有効終了</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {editId === "new" && (
              <EditRow form={form} setForm={setForm} onCommit={commit} onCancel={() => setEditId(null)} />
            )}
            {items?.map((item) =>
              editId === item.id ? (
                <EditRow key={item.id} form={form} setForm={setForm} onCommit={commit} onCancel={() => setEditId(null)} />
              ) : (
                <tr key={item.id}>
                  <td className="font-mono text-xs">{item.symbol_code}</td>
                  <td>{item.item_name}</td>
                  <td className="text-gray-600">{item.maker ?? "—"}</td>
                  <td className="font-mono text-xs text-gray-600">{item.model_number ?? "—"}</td>
                  <td>{item.unit}</td>
                  <td className="text-right">¥{fmt(item.material_cost)}</td>
                  <td className="text-right">¥{fmt(item.labor_cost)}</td>
                  <td>{item.region_code}</td>
                  <td className="text-xs">{item.valid_from}</td>
                  <td className="text-xs">{item.valid_until ?? "—"}</td>
                  <td>
                    <button onClick={() => startEdit(item)} className="text-gray-400 hover:text-primary">
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditRow({ form, setForm, onCommit, onCancel }: {
  form: Partial<MasterItem>;
  setForm: (v: Partial<MasterItem>) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const f = (field: keyof MasterItem, type: "text" | "number" = "text") => ({
    value: form[field] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [field]: type === "number" ? +e.target.value : e.target.value }),
    className: "w-full border rounded px-1 py-0.5 text-xs",
  });

  return (
    <tr className="bg-blue-50">
      <td><input {...f("symbol_code")} placeholder="EX-001" /></td>
      <td><input {...f("item_name")} placeholder="品名" /></td>
      <td><input {...f("maker")} placeholder="メーカー" /></td>
      <td><input {...f("model_number")} placeholder="型番" /></td>
      <td><input {...f("unit")} placeholder="個" /></td>
      <td><input {...f("material_cost", "number")} /></td>
      <td><input {...f("labor_cost", "number")} /></td>
      <td><input {...f("region_code")} placeholder="DEFAULT" /></td>
      <td><input type="date" {...f("valid_from")} /></td>
      <td><input type="date" {...f("valid_until")} /></td>
      <td>
        <div className="flex gap-1">
          <button onClick={onCommit} className="text-green-600 hover:text-green-800"><Check size={14} /></button>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
      </td>
    </tr>
  );
}
