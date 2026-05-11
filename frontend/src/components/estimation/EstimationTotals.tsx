import type { EstimationSummary } from "../../types";

const fmt = (n: number) => n.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

export function EstimationTotals({ summary }: { summary: EstimationSummary }) {
  return (
    <div className="flex justify-end mt-4">
      <div className="w-80 border border-gray-200 rounded-lg overflow-hidden text-sm">
        <div className="flex justify-between px-4 py-2 bg-gray-50 border-b">
          <span>小計</span>
          <span className="font-mono">¥{fmt(summary.subtotal)}</span>
        </div>
        <div className="flex justify-between px-4 py-2 bg-gray-50 border-b">
          <span>諸経費（{Math.round(summary.confirmed_items[0]?.misc_rate * 100 ?? 15)}%）</span>
          <span className="font-mono">¥{fmt(summary.misc_fee)}</span>
        </div>
        <div className="flex justify-between px-4 py-2 bg-gray-50 border-b">
          <span>消費税（{Math.round(summary.confirmed_items[0]?.tax_rate * 100 ?? 10)}%）</span>
          <span className="font-mono">¥{fmt(summary.tax)}</span>
        </div>
        <div className="flex justify-between px-4 py-3 bg-primary text-white font-bold">
          <span>合計（税込）</span>
          <span className="font-mono text-base">¥{fmt(summary.grand_total)}</span>
        </div>
      </div>
    </div>
  );
}
