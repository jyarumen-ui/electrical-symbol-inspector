export interface Job {
  id: string;
  name: string;
  site_name: string | null;
  company_name: string | null;
  status: string;
  region_code: string;
  created_at: string;
  updated_at: string;
}

export interface JobRevision {
  id: string;
  job_id: string;
  rev_number: string;
  pdf_url: string;
  created_at: string;
}

export interface AiCandidate {
  symbolCode: string;
  label: string;
  confidence: number;
}

export type SymbolStatus = "ACCEPTED" | "HOLD" | "UNASSIGNED" | "REJECTED";

export interface SymbolHit {
  id: string;
  job_id: string;
  revision_id: string | null;
  symbol_code: string;
  label: string | null;
  ai_confidence: number | null;
  ai_candidates: AiCandidate[] | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  status: SymbolStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type EstimationStatus = "CONFIRMED" | "PENDING" | "EXCLUDED";

export interface EstimationItem {
  id: string;
  job_id: string;
  symbol_hit_id: string;
  master_item_id: string | null;
  symbol_code: string;
  item_name: string;
  maker: string | null;
  model_number: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  misc_rate: number;
  tax_rate: number;
  status: EstimationStatus;
  note: string | null;
  created_at: string;
}

export interface EstimationSummary {
  job_id: string;
  confirmed_items: EstimationItem[];
  pending_items: EstimationItem[];
  excluded_count: number;
  subtotal: number;
  misc_fee: number;
  tax: number;
  grand_total: number;
}

export interface MasterItem {
  id: string;
  symbol_code: string;
  item_name: string;
  maker: string | null;
  model_number: string | null;
  grade: string | null;
  unit: string;
  material_cost: number;
  labor_cost: number;
  region_code: string;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevisionDiff {
  added: Array<{ id: string; symbol_code: string }>;
  removed: Array<{ id: string; symbol_code: string }>;
  changed: Array<{ from_id: string; to_id: string; from_code: string; to_code: string }>;
  unchanged_count: number;
  summary: { added_count: number; removed_count: number; changed_count: number };
}
