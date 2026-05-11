import type { EstimationItem } from "../../types";

const fmt = (n: number) => n.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

export function MaterialOrderList({ items }: { items: EstimationItem[] }) {
  const withMaker = items.filter((i) => i.maker);
  const grouped = withMaker.reduce<Record<string, EstimationItem[]>>((acc, item) => {
    const key = item.maker!;
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  const makers = Object.keys(grouped).sort();

  if (makers.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        メーカー情報のある資材がありません
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {makers.map((maker) => (
        <div key={maker}>
          <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary inline-block" />
            {maker}
          </h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th>型番</th>
                  <th>品名</th>
                  <th className="text-right">数量</th>
                  <th>単位</th>
                  <th className="text-right">参考単価 (円)</th>
                </tr>
              </thead>
              <tbody>
                {grouped[maker].map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-xs">{item.model_number ?? "—"}</td>
                    <td>{item.item_name}</td>
                    <td className="text-right">{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td className="text-right font-mono">¥{fmt(item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
