import {useEffect,useRef,useState} from 'react';
import type {DictionaryTerm,Finding} from '../shared/types';
import {terminalStatuses} from '../shared/types';
import {Header,ProjectLink} from './components/Header';
import {TermDialog} from './components/TermDialog';
import {BriefView} from './features/BriefView';
import {DictionaryView} from './features/DictionaryView';
import {FailedView,ProgressView} from './features/ProgressView';
import {ReportView} from './features/ReportView';
import {StartView} from './features/StartView';
import {loadDraft,navigate,useRun} from './core';

const route=()=>{const hash=location.hash.slice(1);const params=new URLSearchParams(hash);return{dictionary:hash==='dictionary',id:params.get('run')||'',brief:params.get('view')==='brief'};};
function RunWorkspace({id,brief,onTerm}:{id:string;brief:boolean;onTerm:(term:DictionaryTerm,context?:Finding)=>void}){
  const{run,error,reload}=useRun(id);const[draft,setDraft]=useState(()=>loadDraft(id));const[storageError,setStorageError]=useState(false);
  useEffect(()=>{try{localStorage.setItem('pageprism:draft:'+id,JSON.stringify(draft));setStorageError(false);}catch{setStorageError(true);}},[id,draft]);
  if(error)return <FailedView message={error} onRetry={reload}/>;
  if(!run)return <main className="loading-result" role="status">正在读取拆解…</main>;
  if(!terminalStatuses.includes(run.status))return <ProgressView run={run}/>;
  if(!run.findings.length)return <FailedView message={run.error||'没有保存的观察内容。'} cancelled={run.status==='cancelled'}/>;
  return <>{storageError&&<p role="alert" className="storage-warning">当前浏览器无法保存配置，请及时下载任务说明。</p>}{brief?<BriefView run={run} draft={draft} onDraft={setDraft}/>:<ReportView run={run} draft={draft} onDraft={setDraft} onTerm={(term,findingId)=>onTerm(term,run.findings.find(f=>f.id===findingId))}/>}</>;
}
export default function App(){
  const[current,setCurrent]=useState(route);const[term,setTerm]=useState<{term:DictionaryTerm;context?:Finding}|null>(null);const lastRun=useRef('');
  useEffect(()=>{const handler=()=>{setCurrent(route());setTerm(null);window.scrollTo(0,0);};window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler);},[]);
  useEffect(()=>{if(current.id)lastRun.current=current.id;},[current.id]);
  return <><Header dictionary={current.dictionary} onBack={current.brief?()=>navigate(current.id):current.dictionary&&lastRun.current?()=>navigate(lastRun.current):undefined}/>{!current.id&&!current.dictionary&&<div className="start-project-link"><ProjectLink/></div>}{current.dictionary?<DictionaryView onTerm={term=>setTerm({term})}/>:current.id?<RunWorkspace key={current.id} id={current.id} brief={current.brief} onTerm={(term,context)=>setTerm({term,context})}/>:<StartView/>}{term&&<TermDialog key={term.term.id} term={term.term} context={term.context} onClose={()=>setTerm(null)}/>}</>;
}
