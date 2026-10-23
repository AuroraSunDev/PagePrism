import {useEffect,useState,type FormEvent} from 'react';
import {ArrowRight,ArrowUpRight,Clock,Link,LoaderCircle} from 'lucide-react';
import type {ReportRun} from '../../shared/types';
import {api,mediaUrl,navigate} from '../core';

export function StartView(){
  const[url,setUrl]=useState('');const[error,setError]=useState('');const[busy,setBusy]=useState(false);
  const[recent,setRecent]=useState<(Pick<ReportRun,'id'|'title'|'url'|'status'|'sourceKind'|'createdAt'>&{count:number;preview?:string})[]>([]);
  useEffect(()=>{const controller=new AbortController();void api<typeof recent>('/runs',{signal:controller.signal}).then(setRecent).catch(()=>{});return()=>controller.abort();},[]);
  const start=async(demo=false)=>{
    setError('');setBusy(true);
    try{const run=await api<ReportRun>(demo?'/runs/demo':'/runs',{method:'POST',body:demo?undefined:JSON.stringify({url})});navigate(run.id);}
    catch(e){setError(e instanceof Error?e.message:'无法开始拆解。');setBusy(false);}
  };
  return <main className="start-page">
    <div className="start-heading"><p className="breadcrumb">新的参考 <span>›</span></p><h1 aria-label="把喜欢的网页，讲清楚。">把喜欢的网页，<br/>讲清楚。</h1><p className="intro-copy">输入网址，观察设计与动效，整理成给 Agent 的实现说明。</p></div>
    <form className="url-form" onSubmit={(e:FormEvent)=>{e.preventDefault();void start();}}>
      <div className="url-input"><Link size={20}/><label htmlFor="reference-url" className="sr-only">参考网站网址</label><input id="reference-url" type="url" required placeholder="https://你想参考的网站.com" value={url} onChange={e=>setUrl(e.target.value)} disabled={busy}/></div>
      <button className="button primary" disabled={busy} type="submit">{busy?<LoaderCircle className="spin" size={18}/>:<>开始拆解<ArrowRight size={18}/></>}</button>
    </form>
    <p className="input-help">分析公开单页 · 无需浏览器扩展</p>
    {error&&<p role="alert" className="error-message">{error}</p>}
    <section className="sample-entry">
      <div className="sample-preview" aria-label="原创示例参考页预览"><img src="/reference/architecture.png" alt="原创建筑参考图：水边的混凝土建筑"/><div className="sample-nav">FORM &amp; FIELD<span>Work　 About　 Contact</span></div><div className="sample-headline">Selected<br/>works.</div><span className="sample-link">View all works　→</span></div>
      <div className="sample-copy"><h2>先看一次完整拆解</h2><p>从原站画面到你的实现说明。</p><button className="button secondary" disabled={busy} onClick={()=>void start(true)}>体验示例</button></div>
    </section>
    <section className="recent-section"><h2>最近的拆解</h2>{recent.length?<div className="recent-list">{recent.map(run=><button className="recent-row" key={run.id} onClick={()=>navigate(run.id)}>{run.preview?<img src={mediaUrl(run.id,run.preview)} alt=""/>:<Clock size={22}/>}<span className="recent-main"><strong>{run.title}</strong><span>{run.sourceKind==='demo'?'内置示例':run.url}</span></span><span className="recent-meta">{run.count} 项观察 · {new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric'}).format(new Date(run.createdAt))}</span><ArrowUpRight size={18}/></button>)}</div>:<p className="empty-recent">你的拆解会保存在这台电脑上。</p>}</section>
  </main>;
}
