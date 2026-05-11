import axios from "axios";
import type {
  Job, JobRevision, SymbolHit, EstimationItem, EstimationSummary,
  MasterItem, RevisionDiff,
} from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : "/api",
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!err.response) {
      err.message = "バックエンドサーバーに接続できません。\n`uvicorn app.main:app --reload` で起動してください。";
    }
    return Promise.reject(err);
  }
);

// ── Jobs ──────────────────────────────────────────────────────────────────────
export const getJobs = () => api.get<Job[]>("/jobs").then(r => r.data);
export const getJob = (id: string) => api.get<Job>(`/jobs/${id}`).then(r => r.data);
export const createJob = (body: Partial<Job>) => api.post<Job>("/jobs", body).then(r => r.data);

// ── Revisions ─────────────────────────────────────────────────────────────────
export const getRevisions = (jobId: string) =>
  api.get<JobRevision[]>(`/jobs/${jobId}/revisions`).then(r => r.data);
export const createRevision = (jobId: string, body: { rev_number: string; pdf_url: string }) =>
  api.post<JobRevision>(`/jobs/${jobId}/revisions`, body).then(r => r.data);
export const diffRevisions = (jobId: string, revA: string, revB: string) =>
  api.get<RevisionDiff>(`/jobs/${jobId}/revisions/diff`, { params: { rev_a: revA, rev_b: revB } }).then(r => r.data);

// ── SymbolHits ────────────────────────────────────────────────────────────────
export const getSymbolHits = (jobId: string) =>
  api.get<SymbolHit[]>(`/symbol-hits/job/${jobId}`).then(r => r.data);
export const updateSymbolHit = (id: string, body: Partial<SymbolHit>) =>
  api.patch<SymbolHit>(`/symbol-hits/${id}`, body).then(r => r.data);
export const createSymbolHit = (body: Partial<SymbolHit>) =>
  api.post<SymbolHit>("/symbol-hits", body).then(r => r.data);

// ── Estimation ────────────────────────────────────────────────────────────────
export const generateEstimation = (jobId: string) =>
  api.post<{ generated: number; skipped: number; items: EstimationItem[] }>(
    `/jobs/${jobId}/estimation/generate`
  ).then(r => r.data);
export const getEstimationSummary = (jobId: string) =>
  api.get<EstimationSummary>(`/jobs/${jobId}/estimation/summary`).then(r => r.data);
export const updateEstimationItem = (id: string, body: Partial<EstimationItem>) =>
  api.patch<EstimationItem>(`/estimation-items/${id}`, body).then(r => r.data);
export const exportExcel = (jobId: string) =>
  api.get(`/jobs/${jobId}/estimation/export/excel`, { responseType: "blob" });
export const exportPdf = (jobId: string) =>
  api.get(`/jobs/${jobId}/estimation/export/pdf`, { responseType: "blob" });

// ── Master Items ──────────────────────────────────────────────────────────────
export const getMasterItems = (params?: { symbol_code?: string; region_code?: string }) =>
  api.get<MasterItem[]>("/master-items", { params }).then(r => r.data);
export const createMasterItem = (body: Partial<MasterItem>) =>
  api.post<MasterItem>("/master-items", body).then(r => r.data);
export const updateMasterItem = (id: string, body: Partial<MasterItem>) =>
  api.put<MasterItem>(`/master-items/${id}`, body).then(r => r.data);

// ── Settings ──────────────────────────────────────────────────────────────────
export const getSettings = () =>
  api.get<{ ai_confidence_threshold: number; default_misc_rate: number; default_tax_rate: number; company_name: string }>(
    "/settings/defaults"
  ).then(r => r.data);

// ── Drawings ──────────────────────────────────────────────────────────────────
export const uploadDrawing = (jobId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post<{ detected: number; filename: string; message: string }>(
    `/jobs/${jobId}/drawings/upload`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  ).then(r => r.data);
};
