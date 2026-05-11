import type { FC } from "react";
import clsx from "clsx";

const MAP: Record<string, string> = {
  CONFIRMED: "badge-confirmed",
  PENDING: "badge-pending",
  EXCLUDED: "badge-excluded",
  ACCEPTED: "badge-confirmed",
  HOLD: "badge-hold",
  UNASSIGNED: "badge bg-gray-100 text-gray-600",
  REJECTED: "badge-excluded",
};

const LABEL: Record<string, string> = {
  CONFIRMED: "確定",
  PENDING: "未確定",
  EXCLUDED: "除外",
  ACCEPTED: "承認",
  HOLD: "保留",
  UNASSIGNED: "未割当",
  REJECTED: "却下",
};

export const StatusBadge: FC<{ status: string }> = ({ status }) => (
  <span className={clsx(MAP[status] ?? "badge bg-gray-100 text-gray-500")}>
    {LABEL[status] ?? status}
  </span>
);
