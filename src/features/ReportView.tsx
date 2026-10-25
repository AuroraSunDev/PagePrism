import { useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  FileText,
  Info,
  ChevronDown,
} from "lucide-react";
import type { DictionaryTerm, ReportRun } from "../../shared/types";
import { termMap } from "../../shared/dictionary";
import { mediaUrl, navigate, type Draft } from "../core";
import {
  phaseLabels,
  parameterLabels,
  coverageText,
} from "../../shared/behavior";
import { MediaViewer } from "../components/MediaViewer";

export function ReportView({
  run,
  draft,
  onDraft,
  onTerm,
}: {
  run: ReportRun;
  draft: Draft;
  onDraft: (draft: Draft) => void;
  onTerm: (term: DictionaryTerm, findingId: string) => void;
}) {
  const [activeId, setActiveId] = useState(run.findings[0]?.id);
  const [mobileTab, setMobileTab] = useState<"description" | "media">(
    "description",
  );
  const finding =
    run.findings.find((f) => f.id === activeId) || run.findings[0];
  const selected = draft.selected.filter((id) =>
    run.findings.some((f) => f.id === id),
  );
  const toggle = (id: string) =>
    onDraft({
      ...draft,
      selected: selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    });
  return (
    <main className="report-page">
      <section className="source-strip">
        <img
          src={mediaUrl(run.id, run.media.preview || finding.screenshot)}
          alt=""
        />
        <div className="source-identity">
          <div>
            <h1>{run.title}</h1>
            {run.sourceKind === "demo" && (
              <span className="source-tag">内置示例</span>
            )}
          </div>
          <p>
            {run.sourceKind === "demo"
              ? "Form & Field / 原创参考页"
              : run.finalUrl || run.url}
          </p>
        </div>
        <a
          className="source-open"
          href={run.finalUrl || run.url}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={16} />
          <span>在新标签中打开</span>
        </a>
      </section>
      {(run.status !== "completed" || run.warnings.length > 0) && (
        <div className="report-notice">
          <Info size={16} />
          <span>
            {run.status === "cancelled"
              ? "采集已取消，以下为已保存的观察。"
              : run.status === "partial"
                ? "本轮仅部分完成，保留已观察内容。"
                : run.warnings[0]}
          </span>
        </div>
      )}
      <div className="report-grid">
        <aside className="finding-rail">
          <div className="rail-heading">
            <h2>观察条目</h2>
            <button
              className="text-button"
              onClick={() =>
                onDraft({
                  ...draft,
                  selected:
                    selected.length === run.findings.length
                      ? []
                      : run.findings.map((f) => f.id),
                })
              }
            >
              {selected.length === run.findings.length ? "取消全选" : "全选"}
            </button>
          </div>
          <div className="finding-list">
            {run.findings.map((f) => (
              <div
                key={f.id}
                className={`finding-row ${finding.id === f.id ? "active" : ""}`}
              >
                <input
                  type="checkbox"
                  aria-label={`选择 ${f.title}`}
                  checked={selected.includes(f.id)}
                  onChange={() => toggle(f.id)}
                />
                <button
                  onClick={() => {
                    setActiveId(f.id);
                    setMobileTab("description");
                  }}
                >
                  {f.title}
                </button>
              </div>
            ))}
          </div>
          <details className="coverage-summary">
            <summary>
              本次观察范围
              <ChevronDown size={14} />
            </summary>
            <p>
              {run.coverage.engine} · {run.coverage.viewports.join(" / ")}
            </p>
            {!!run.coverage.checks?.length && (
              <ul className="coverage-checks" aria-label="观察检查记录">
                {run.coverage.checks.map((c) => (
                  <li key={c.id}>
                    <strong>{coverageText(c)}</strong>
                    {c.reason && <span>{c.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
            <ul>
              {run.coverage.actions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <ul>
              {[...run.coverage.limits, ...run.warnings].map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </details>
        </aside>
        <div className="mobile-report-tabs tabs">
          <button
            className={mobileTab === "description" ? "active" : ""}
            onClick={() => setMobileTab("description")}
          >
            说明
          </button>
          <button
            className={mobileTab === "media" ? "active" : ""}
            onClick={() => setMobileTab("media")}
          >
            原站画面
          </button>
        </div>
        <article
          className={`finding-detail ${mobileTab === "media" ? "mobile-hidden" : ""}`}
        >
          <h2>{finding.title}</h2>
          <p className="finding-location">{finding.trigger}</p>
          <div className="term-links">
            {finding.termIds.map((id) => {
              const term = termMap.get(id);
              return term ? (
                <button
                  key={id}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    onTerm(term, finding.id);
                  }}
                  aria-label={`术语：${term.name.zh}`}
                >
                  {term.name.zh}
                </button>
              ) : null;
            })}
          </div>
          <p className="finding-summary">{finding.summary}</p>
          <dl className="behavior-list">
            <div>
              <dt>触发方式</dt>
              <dd>{finding.trigger}</dd>
            </div>
            <div>
              <dt>变化过程</dt>
              <dd>{finding.changes}</dd>
            </div>
            <div>
              <dt>实现建议</dt>
              <dd>{finding.implementation}</dd>
            </div>
          </dl>
          {finding.behavior && (
            <section className="interaction-story" aria-label="交互过程与参数">
              <h3>交互过程</h3>
              <ol>
                {finding.behavior.phases.map((p) => (
                  <li key={p.name}>
                    <strong>{phaseLabels[p.name]}</strong>
                    <p>{p.description}</p>
                    <span>采样 +{(p.elapsedMs / 1000).toFixed(2)}s</span>
                  </li>
                ))}
              </ol>
              <p className="muted">
                阶段时间为实际采样位置，不是动画时长。组合关系属于基于采样的解释。
              </p>
              <details>
                <summary>参数来源与未知项</summary>
                <dl>
                  {finding.behavior.parameters.map((p, i) => (
                    <div key={i}>
                      <dt>{parameterLabels[p.name] || p.name}</dt>
                      <dd>
                        {p.status === "observed"
                          ? `${p.value}（CSS声明）`
                          : "未确认"}
                        <small>{p.reason}</small>
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </section>
          )}
          <section className="observed-facts">
            <h3>
              {finding.evidenceStatus === "candidate"
                ? "候选解释 · 已记录变化"
                : "已观察"}
            </h3>
            <div className="fact-intro">
              <FileText size={19} />
              <p>以下来自这次页面采集，可结合右侧画面核对。</p>
            </div>
            <dl>
              {finding.facts.map((fact, i) => (
                <div key={i}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <div className="unknown-note">
            <Info size={19} />
            <div>
              <strong>原站使用的动画库尚未确认</strong>
              <p>实现建议可以帮助重现相似行为，不能视为原站源码。</p>
            </div>
          </div>
          <details className="correction">
            <summary>用自己的话调整这个效果</summary>
            <label className="sr-only" htmlFor="description-override">
              你的效果描述
            </label>
            <textarea
              id="description-override"
              rows={3}
              maxLength={3000}
              placeholder="你希望保留什么、改变什么？"
              value={draft.input.descriptionOverrides[finding.id] || ""}
              onChange={(e) =>
                onDraft({
                  ...draft,
                  input: {
                    ...draft.input,
                    descriptionOverrides: {
                      ...draft.input.descriptionOverrides,
                      [finding.id]: e.target.value,
                    },
                  },
                })
              }
            />
            <p className="muted">只进入你的任务说明，不改写原站证据。</p>
          </details>
        </article>
        <div
          className={`media-column ${mobileTab === "description" ? "mobile-hidden" : ""}`}
        >
          <MediaViewer key={finding.id} run={run} finding={finding} />
        </div>
      </div>
      <footer className="selection-bar">
        <span>
          已选择 <strong>{selected.length}</strong> 项
        </span>
        <button
          className="button primary"
          disabled={!selected.length}
          onClick={() => navigate(run.id, true)}
        >
          定制并生成
          <ArrowRight size={18} />
        </button>
      </footer>
    </main>
  );
}
