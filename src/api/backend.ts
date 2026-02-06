import type { Policy, Source, Violation } from "../mocks/compliance";

export const BACKEND_BASE_URL = "http://127.0.0.1:5005";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchBackendStatus() {
  return await getJson<{
    status: string;
    last_scan_iso: string | null;
    last_scan_error: string | null;
    api_key_configured: boolean;
    model: string;
  }>("/api/status");
}

export async function fetchBackendSources(): Promise<Source[]> {
  const data = await getJson<{ sources: Source[] }>("/api/sources");
  return data.sources;
}

export async function fetchBackendPolicies(): Promise<Policy[]> {
  const data = await getJson<{ policies: Policy[] }>("/api/policies");
  // backend includes `text` field; we ignore extra fields in TS
  return data.policies;
}

export async function fetchBackendViolations(params?: {
  sourceId?: string;
  policyId?: string;
}): Promise<Violation[]> {
  const qs = new URLSearchParams();
  if (params?.sourceId) qs.set("sourceId", params.sourceId);
  if (params?.policyId) qs.set("policyId", params.policyId);
  const data = await getJson<{ violations: Violation[] }>(
    `/api/violations${qs.toString() ? `?${qs.toString()}` : ""}`,
  );
  return data.violations;
}

export async function uploadBackendPolicy(input: {
  name: string;
  text: string;
}): Promise<Policy> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/policies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  const data = (await res.json()) as { policy: Policy };
  return data.policy;
}

export async function deleteBackendPolicy(policyId: string): Promise<boolean> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/policies/${policyId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  const data = (await res.json()) as { deleted: boolean };
  return data.deleted;
}

