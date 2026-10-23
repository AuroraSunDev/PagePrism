import { useDeferredValue, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { domains, searchTerms, terms } from "../../shared/dictionary";
import type { DictionaryTerm } from "../../shared/types";
export function DictionaryView({
  onTerm,
}: {
  onTerm: (term: DictionaryTerm) => void;
}) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const deferred = useDeferredValue(query);
  const results = searchTerms(deferred, domain);
  return (
    <main className="dictionary-page">
      <div className="dictionary-heading">
        <h1>让你看到的，有一个名字。</h1>
        <p>从白话、中文或英文开始查找，再回到你的网页参考中使用。</p>
      </div>
      <div className="dictionary-tools">
        <div className="dictionary-search">
          <Search size={20} />
          <label className="sr-only" htmlFor="term-search">
            搜索术语
          </label>
          <input
            type="search"
            id="term-search"
            placeholder="试试：一张一张出现、磁吸、Parallax…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="sr-only" htmlFor="domain">
          词典主题
        </label>
        <select
          id="domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        >
          <option value="">全部主题</option>
          {Object.entries(domains).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="dictionary-count">
        {results.length} / {terms.length} 个详细词条
        <span>包含既有 46 个样例与 3 个项目扩写</span>
      </div>
      <div className="dictionary-list">
        {results.length ? (
          results.map((term) => (
            <button
              className="dictionary-row"
              key={term.id}
              onClick={(event) => {
                event.currentTarget.focus();
                onTerm(term);
              }}
            >
              <div>
                <h2>
                  {term.name.zh}
                  <span>{term.name.en}</span>
                </h2>
                <p>{term.summary}</p>
              </div>
              <span className="dictionary-domain">
                {domains[term.domains[0]] || term.domains[0]}
              </span>
              <ArrowUpRight size={18} />
            </button>
          ))
        ) : (
          <p className="empty-recent">
            暂未收录这个词。可以换一种白话说法，或搜索更短的关键词。
          </p>
        )}
      </div>
      <p className="dictionary-footnote">
        词条是内容草案；完整来源目录另存于项目文档。没有详细解释的目录项不会伪装成已完成词条。
      </p>
    </main>
  );
}
