import { Link } from "react-router-dom";
import { ArrowLeft, Database } from "lucide-react";
import { MasterItemsTable } from "../components/master/MasterItemsTable";

export function MasterItemsPage() {
  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-gray-400 hover:text-primary">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="flex items-center gap-2">
            <Database size={22} className="text-primary" />
            単価マスター管理
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">材料費・工賃の登録・更新（更新時は履歴を自動保存）</p>
        </div>
      </div>
      <div className="card">
        <MasterItemsTable />
      </div>
    </div>
  );
}
