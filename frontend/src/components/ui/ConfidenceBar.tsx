import type { FC } from "react";
import clsx from "clsx";

export const ConfidenceBar: FC<{ value: number; threshold: number }> = ({ value, threshold }) => {
  const pct = Math.round(value * 100);
  const ok = value >= threshold;
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={clsx("h-full rounded-full", ok ? "bg-green-500" : "bg-yellow-400")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={clsx("text-xs font-mono", ok ? "text-green-700" : "text-yellow-700")}>
        {pct}%
      </span>
    </div>
  );
};
