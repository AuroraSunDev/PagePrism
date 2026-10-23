import {useState} from 'react';
import {Check,Copy,Download} from 'lucide-react';
import {buildAgentBrief,buildDesignMarkdown} from '../../shared/export';
import type {ReportRun,SelectionInput} from '../../shared/types';
import {copyText,downloadFile,type Draft} from '../core';

export function BriefView({run,draft,onDraft}:{run:ReportRun;draft:Draft;onDraft:(draft:Draft)=>void}){
  const[mode,setMode]=useState<'brief'|'design'|'json'>('brief');const[notice,setNotice]=useState('');
  const selected=run.findings.filter(f=>draft.selected.includes(f.id));
  const update=<K extends keyof SelectionInput>(key:K,value:SelectionInput[K])=>onDraft({...draft,input:{...draft.input,[key]:value}});
  let brief='';let validation='';try{brief=buildAgentBrief(run,draft.selected,draft.input);}catch(e){validation=e instanceof Error?e.message:'';}
  const output=mode==='brief'?brief:mode==='design'?buildDesignMarkdown(run):JSON.stringify({run,selection:{ids:draft.selected,input:draft.input}},null,2);
  const filename=mode==='brief'?'AGENT-BRIEF.md':mode==='design'?'DESIGN.md':'evidence.json';
  const copy=async()=>{try{await copyText(output);setNotice('已复制到剪贴板');}catch{setNotice('剪贴板不可用，请下载文件。');}setTimeout(()=>setNotice(''),4000);};
  return <main className="brief-page"><div className="brief-heading"><h1>让参考，成为你的方案。</h1><p>已选择 {selected.length} 项 · {selected.map(f=>f.title).join('、')||'请返回报告选择'}</p></div><div className="brief-grid">
    <form className="customize-form" onSubmit={e=>e.preventDefault()}>
      <label htmlFor="purpose"><span className="required">*</span>你想用网站做什么？</label><textarea id="purpose" required maxLength={5000} rows={3} placeholder="例如：展示我的课程项目，方便招聘者了解我的作品。" value={draft.input.purpose} onChange={e=>update('purpose',e.target.value)}/>
      <label htmlFor="destination">放在哪个区域？</label><input id="destination" maxLength={500} placeholder="例如：首页精选作品" value={draft.input.destination} onChange={e=>update('destination',e.target.value)}/>
      <div className="form-pair"><div><label htmlFor="accent">强调色</label><div className="color-input"><input id="accent" type="color" value={/^#[a-f0-9]{6}$/i.test(draft.input.accent)?draft.input.accent:'#315be8'} onChange={e=>update('accent',e.target.value)}/><span>{draft.input.accent}</span></div></div><fieldset><legend>动效节奏</legend><div className="segmented">{(['quick','balanced','slow'] as const).map((pace,i)=><button key={pace} type="button" aria-pressed={draft.input.pace===pace} className={draft.input.pace===pace?'selected':''} onClick={()=>update('pace',pace)}>{['轻快','适中','舒缓'][i]}</button>)}</div></fieldset></div>
      <label htmlFor="content">文字与素材</label><textarea id="content" rows={3} maxLength={5000} placeholder="添加标题、文案或素材说明" value={draft.input.content} onChange={e=>update('content',e.target.value)}/>
      <label htmlFor="stack">现有技术栈（可选）</label><input id="stack" maxLength={500} placeholder="例如：React + TypeScript" value={draft.input.stack} onChange={e=>update('stack',e.target.value)}/><p className="muted">偏好是你的选择，测量值仍保留在原站证据中。</p>
    </form>
    <section className="export-panel"><h2>Agent 任务说明</h2><div className="tabs">{(['brief','design','json']as const).map((tab,i)=><button key={tab} className={mode===tab?'active':''} onClick={()=>setMode(tab)}>{['任务说明','设计观察','证据 JSON'][i]}</button>)}</div><pre data-testid="export-preview" className={`export-preview ${!output?'empty':''}`}>{output||validation||'填写左侧信息后生成任务说明。'}</pre><div className="export-actions"><span role="status">{notice}</span><button className="button secondary" disabled={!output} onClick={()=>void copy()}>{notice.startsWith('已复制')?<Check size={18}/>:<Copy size={18}/>}复制</button><button className="button primary" disabled={!output} onClick={()=>downloadFile(filename,output,mode==='json'?'application/json':'text/markdown;charset=utf-8')}><Download size={18}/>下载 Markdown</button></div></section>
  </div></main>;
}
