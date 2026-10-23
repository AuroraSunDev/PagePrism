import { Check, LoaderCircle, ArrowLeft, AlertCircle } from "lucide-react";
import type { ReportRun } from "../../shared/types";
import { api, navigate } from "../core";

export function ProgressView({ run }: { run: ReportRun }) {
  const phases = ["打开参考页面", "观察结构与交互", "整理证据报告"];
  const index =
    run.status === "processing" ? 2 : run.status === "observing" ? 1 : 0;
  return (
    <main className="progress-page">
      <div className="progress-symbol">
        <LoaderCircle className="spin" size={32} />
      </div>
      <h1>正在拆解这个参考</h1>
      <p className="progress-url">
        {run.sourceKind === "demo" ? "Studio Reference · 内置示例" : run.url}
      </p>
      <ol className="phase-list">
        {phases.map((phase, i) => (
          <li
            key={phase}
            className={i === index ? "current" : i < index ? "done" : ""}
          >
            <span>{i < index ? <Check size={16} /> : i + 1}</span>
            <div>
              {phase}
              {i === index && <small>{run.stage}</small>}
            </div>
          </li>
        ))}
      </ol>
      <p className="muted">只执行读取、滚动和悬停。单次最多观察 90 秒。</p>
      <button
        className="button secondary"
        onClick={() =>
          void api(`/runs/${run.id}/cancel`, { method: "POST" }).catch(() => {})
        }
      >
        取消拆解
      </button>
    </main>
  );
}
export function FailedView({
  message,
  cancelled = false,
  onRetry,
}: {
  message: string;
  cancelled?: boolean;
  onRetry?: () => void;
}) {
  return (
    <main className="failure-page">
      <AlertCircle size={32} />
      <h1>{cancelled ? "这次拆解已取消" : "暂时无法完成拆解"}</h1>
      <p>{message}</p>
      <p className="muted">
        需要登录、访问限制或页面加载失败时，我们不会用示例结果代替。
      </p>
      <div className="button-row">
        <button className="button secondary" onClick={() => navigate()}>
          <ArrowLeft size={16} />
          返回开始
        </button>
        {onRetry && (
          <button className="button primary" onClick={onRetry}>
            重新读取结果
          </button>
        )}
      </div>
    </main>
  );
}
