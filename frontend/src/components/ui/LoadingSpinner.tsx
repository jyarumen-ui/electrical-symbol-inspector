import type { FC } from "react";

export const LoadingSpinner: FC<{ label?: string }> = ({ label = "読み込み中..." }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
    <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    <span className="text-sm">{label}</span>
  </div>
);
