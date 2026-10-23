import { useEffect, useRef } from "react";
import { X, ExternalLink } from "lucide-react";
import { sources, termMap } from "../../shared/dictionary";
import type { DictionaryTerm, Finding } from "../../shared/types";
export function TermDialog({
  term,
  context,
  onClose,
}: {
  term: DictionaryTerm;
  context?: Finding;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      origin?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="term-dialog"
      aria-labelledby="term-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        className="icon-button close-dialog"
        aria-label="关闭词条"
        onClick={onClose}
      >
        <X />
      </button>
      <p className="dialog-kicker">词典 · {term.kind}</p>
      <h2 id="term-title">
        {term.name.zh}
        <span>{term.name.en}</span>
      </h2>
      <p className="term-summary">{term.summary}</p>
      {context && (
        <section className="context-note">
          <h3>与当前观察的关系</h3>
          <p>
            {context.title}：
            {context.termIds.includes(term.id)
              ? "这个术语用于帮助理解当前条目的触发、变化或适配；具体关系以观察证据为准。"
              : "相关知识补充。"}
          </p>
          <p>
            {context.evidenceStatus === "candidate"
              ? "目前为候选解释，仍需结合片段判断。"
              : "术语关联不代表已确定原站实现工具。"}
          </p>
        </section>
      )}
      <section>
        <h3>怎样理解</h3>
        <p>{term.mechanism}</p>
      </section>
      {term.distinctions.length > 0 && (
        <section>
          <h3>容易混淆的地方</h3>
          <ul>
            {term.distinctions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {term.rules.length > 0 && (
        <section>
          <h3>适配与检查</h3>
          <ul>
            {term.rules.map((r) => (
              <li key={r.when}>
                <strong>{r.when}：</strong>
                {r.requirement}
              </li>
            ))}
          </ul>
        </section>
      )}
      {term.relations.length > 0 && (
        <p className="muted">
          相关词：
          {term.relations
            .map((r) => termMap.get(r.termId)?.name.zh)
            .filter(Boolean)
            .join("、")}
        </p>
      )}
      <details>
        <summary>参考来源</summary>
        <ul className="source-list">
          {term.sources.map((ref, i) => {
            const source = sources.find((s) => s.id === ref.sourceId);
            return source ? (
              <li key={i}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                  <ExternalLink size={13} />
                </a>
              </li>
            ) : null;
          })}
        </ul>
      </details>
      <button className="button secondary dialog-return" onClick={onClose}>
        回到当前页面
      </button>
    </dialog>
  );
}
