import {ArrowLeft,ArrowUpRight,BookOpen,Plus} from 'lucide-react';
import {navigate} from '../core';
export function Header({dictionary=false,onBack}:{dictionary?:boolean;onBack?:()=>void}){
  return <header className="app-header">
    <button className="brand" onClick={()=>navigate()}>页棱镜 <span>PagePrism</span></button>
    <nav aria-label="主导航">
      <button aria-current={!dictionary?'page':undefined} onClick={()=>navigate()}>拆解工作台</button>
      <button aria-current={dictionary?'page':undefined} onClick={()=>{location.hash='dictionary';}}><BookOpen className="mobile-icon"/>词典</button>
    </nav>
    <div className="header-action">{onBack?<button className="quiet" onClick={onBack}><ArrowLeft size={18}/>返回报告</button>:<button className="button primary small" onClick={()=>navigate()}><Plus size={18}/><span>新建拆解</span></button>}</div>
  </header>;
}
export function ProjectLink(){return <a className="project-link" href="/project-info" target="_blank" rel="noreferrer">查看项目说明<ArrowUpRight size={16}/></a>;}
