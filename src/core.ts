import { useEffect, useState } from "react";
import type { ReportRun, SelectionInput } from "../shared/types";
import { MAX_FINDINGS } from "../shared/limits";
import { terminalStatuses } from "../shared/types";

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "请求未能完成，请稍后重试。");
  return body;
}
export const mediaUrl = (id: string, file: string) =>
  `/api/runs/${encodeURIComponent(id)}/media/${encodeURIComponent(file)}`;
export const navigate = (id?: string, brief = false) => {
  window.location.hash = id ? `run=${id}${brief ? "&view=brief" : ""}` : "";
};
export function useRun(id: string) {
  const [run, setRun] = useState<ReportRun | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const result = await api<ReportRun>(`/runs/${id}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRun(result);
        setError("");
        if (!terminalStatuses.includes(result.status))
          timer = setTimeout(load, 650);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "无法读取拆解。");
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, retry]);
  return { run, error, reload: () => setRetry((x) => x + 1) };
}
export interface Draft {
  version: 1;
  selected: string[];
  input: SelectionInput;
}
export function loadDraft(id: string): Draft {
  const empty: Draft = {
    version: 1,
    selected: [],
    input: {
      purpose: "",
      destination: "",
      accent: "#315be8",
      pace: "balanced",
      content: "",
      stack: "",
      descriptionOverrides: {},
    },
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem("pageprism:draft:" + id) || "null",
    );
    if (saved?.version !== 1 || !Array.isArray(saved.selected) || !saved.input)
      return empty;
    const fields = ["purpose", "destination", "accent", "content", "stack"];
    if (
      !fields.every((k) => typeof saved.input[k] === "string") ||
      !["quick", "balanced", "slow"].includes(saved.input.pace)
    )
      return empty;
    return {
      version: 1,
      selected: saved.selected
        .filter((v: unknown) => typeof v === "string")
        .slice(0, MAX_FINDINGS),
      input: {
        ...empty.input,
        ...saved.input,
        descriptionOverrides: Object.fromEntries(
          Object.entries(saved.input.descriptionOverrides || {}).filter(
            ([, v]) => typeof v === "string",
          ),
        ),
      },
    };
  } catch {
    return empty;
  }
}
export function downloadFile(
  name: string,
  body: Blob | string,
  type = "text/markdown;charset=utf-8",
) {
  const url = URL.createObjectURL(
    body instanceof Blob ? body : new Blob([body], { type }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}
