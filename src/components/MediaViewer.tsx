import { useRef, useState } from "react";
import { Download, Image as ImageIcon, RotateCcw, Video } from "lucide-react";
import type { Finding, ReportRun } from "../../shared/types";
import { downloadFile, mediaUrl } from "../core";
import { composeFrameGrid } from "../media-grid";

export function MediaViewer({
  run,
  finding,
}: {
  run: ReportRun;
  finding: Finding;
}) {
  const [mode, setMode] = useState<"original" | "frames">("original");
  const [failed, setFailed] = useState(false);
  const [count, setCount] = useState(6);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const hasVideo = !!(finding.clip && run.media.video);
  const replay = () => {
    const el = video.current;
    if (!el) return;
    el.currentTime = Math.min(
      finding.clip?.startSeconds || 0,
      Number.isFinite(el.duration) ? Math.max(0, el.duration - 0.1) : Infinity,
    );
    void el.play().catch(() => setFailed(true));
  };
  const exportGrid = async () => {
    setExporting(true);
    setNotice("");
    try {
      const blob = await composeFrameGrid(finding.frames, count, (file) =>
        mediaUrl(run.id, file),
      );
      downloadFile(`${finding.id}-frames.png`, blob);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "无法导出图片。");
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="media-viewer" aria-label="原站对照画面">
      <div className="tabs">
        <button
          className={mode === "original" ? "active" : ""}
          onClick={() => setMode("original")}
        >
          {hasVideo ? <Video size={16} /> : <ImageIcon size={16} />}原站片段
        </button>
        <button
          className={mode === "frames" ? "active" : ""}
          onClick={() => setMode("frames")}
        >
          关键帧
          {finding.frames.length > 0 && (
            <span className="tab-count">{finding.frames.length}</span>
          )}
        </button>
      </div>
      {mode === "original" ? (
        <div className="original-media">
          {hasVideo && !failed ? (
            <video
              ref={video}
              controls
              playsInline
              preload="metadata"
              poster={mediaUrl(run.id, finding.screenshot)}
              src={mediaUrl(run.id, run.media.video!)}
              onLoadedMetadata={() => {
                const el = video.current;
                if (el)
                  el.currentTime = Math.min(
                    finding.clip!.startSeconds,
                    Math.max(0, el.duration - 0.1),
                  );
              }}
              onTimeUpdate={() => {
                const el = video.current;
                if (
                  el &&
                  !el.paused &&
                  el.currentTime > finding.clip!.endSeconds
                )
                  el.pause();
              }}
              onError={() => setFailed(true)}
            />
          ) : (
            <img
              src={mediaUrl(run.id, finding.screenshot)}
              alt={`${finding.title}的原站截图`}
            />
          )}
          <div className="media-caption">
            <span>
              {finding.id === "mobile-layout" ? "390 × 844" : "1440 × 900"} ·
              实际采集{hasVideo ? " · 视频起点约定位" : ""}
            </span>
            {hasVideo && !failed && (
              <button className="quiet" onClick={replay}>
                <RotateCcw size={14} />
                重播本段
              </button>
            )}
          </div>
          {failed && (
            <p className="inline-note">
              当前浏览器无法播放此视频，可切换关键帧查看实际过程。
            </p>
          )}
        </div>
      ) : (
        <div className="frames-panel">
          {finding.frames.length ? (
            <>
              <p className="muted">
                动作开始后的实测采样时间，非视频编码时间。
              </p>
              <div className="frame-grid">
                {finding.frames.map((frame, index) => (
                  <figure key={frame.file}>
                    <img
                      src={mediaUrl(run.id, frame.file)}
                      alt={`第${index + 1}帧，动作后${(frame.elapsedMs / 1000).toFixed(2)}秒`}
                    />
                    <figcaption>
                      +{(frame.elapsedMs / 1000).toFixed(2)}s
                    </figcaption>
                  </figure>
                ))}
              </div>
              <div className="grid-export">
                <label htmlFor="frame-count">导出帧数</label>
                <select
                  id="frame-count"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {[4, 6, 9].map((n) => (
                    <option key={n} value={n}>
                      {n} 格
                    </option>
                  ))}
                </select>
                <button
                  className="button secondary small"
                  disabled={exporting}
                  onClick={() => void exportGrid()}
                >
                  <Download size={15} />
                  {exporting ? "正在生成…" : "下载拼图 PNG"}
                </button>
              </div>
              {notice && (
                <p role="alert" className="muted">
                  {notice}
                </p>
              )}
            </>
          ) : (
            <div className="empty-media">
              <ImageIcon />
              <p>这个条目是静态观察，没有动作关键帧。</p>
              <button
                className="text-button"
                onClick={() => setMode("original")}
              >
                查看原站截图
              </button>
            </div>
          )}
        </div>
      )}
      <details className="capture-details">
        <summary>采集条件与限制</summary>
        <p>独立 Chromium · {run.createdAt.slice(0, 10)} · 未携带登录信息</p>
        <ul>
          {finding.limitations.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
