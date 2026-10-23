import express from 'express';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { createRun, listRuns, readRun, recoverInterruptedRuns, runDirectory, safeMediaName, saveRun } from './store';
import { validatePublicUrl } from './url-policy';
import { captureRun } from './capture';

export async function startServer(port = 4317): Promise<Server> {
  const app = express();
  const controllers = new Map<string, AbortController>();
  const root = fileURLToPath(new URL('../', import.meta.url));
  await recoverInterruptedRuns();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    const host = req.get('host') || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host)) return void res.status(403).json({error:'此服务仅供本机使用。'});
    const origin=req.get('origin');
    if (origin && ![app.locals.origin,app.locals.origin?.replace('127.0.0.1','localhost'),'http://127.0.0.1:5173','http://localhost:5173'].includes(origin)) return void res.status(403).json({error:'不允许从其他网站创建或读取本地任务。'});
    next();
  });
  app.use(express.json({limit:'12kb'}));
  app.get('/api/health',(_req,res)=>res.json({ok:true,name:'PagePrism'}));
  app.get('/api/runs',async(_req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json((await listRuns()).slice(0,20).map(run=>({id:run.id,title:run.title,url:run.url,status:run.status,createdAt:run.createdAt,sourceKind:run.sourceKind,count:run.findings.length,preview:run.media.preview})));
  });
  const create = (demo: boolean): express.RequestHandler => async(req,res)=>{
    try {
      let url: string;
      if (demo) url = app.locals.origin + '/reference/';
      else {
        const body=z.object({url:z.string().min(1).max(2048)}).strict().parse(req.body);
        url=(await validatePublicUrl(body.url)).href;
      }
      if (controllers.size) return void res.status(409).json({error:'已有一个拆解正在进行，请等待完成或先取消。'});
      const run=createRun(url,demo?'demo':'public');
      const controller=new AbortController();
      controllers.set(run.id,controller);
      try { await saveRun(run); } catch(error) { controllers.delete(run.id); throw error; }
      res.status(202).json(run);
      void captureRun(run,{signal:controller.signal,onUpdate:saveRun,trustedFixture:demo}).catch(async()=>{
        run.status='failed';run.stage='保存结果时发生错误';run.error='请检查本地文件夹的可写空间。';
        await saveRun(run).catch(()=>{});
      }).finally(()=>controllers.delete(run.id));
    } catch(error) {
      res.status(400).json({error:error instanceof z.ZodError?'请输入完整的公开页面网址。':error instanceof Error?error.message:'无法创建拆解。'});
    }
  };
  app.post('/api/runs',create(false));
  app.post('/api/runs/demo',create(true));
  app.get('/api/runs/:id',async(req,res)=>{
    const run=await readRun(req.params.id);
    res.setHeader('Cache-Control','no-store');
    if(!run) return void res.status(404).json({error:'没有找到这次拆解。'});
    res.json(run);
  });
  app.post('/api/runs/:id/cancel',async(req,res)=>{
    const controller=controllers.get(req.params.id);
    if(!controller) return void res.status(409).json({error:'这个任务已结束或不存在。'});
    controller.abort();res.json({ok:true});
  });
  app.get('/api/runs/:id/media/:file',async(req,res)=>{
    const {id,file}=req.params;
    const run=await readRun(id);
    if(!run || !safeMediaName(file) || !run.media.files.includes(file)) return void res.status(404).json({error:'媒体不存在或尚未保存。'});
    res.sendFile(file,{root:runDirectory(id),dotfiles:'allow'});
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'不存在的接口。'}));
  app.use('/reference',express.static(join(root,'public/reference'),{index:'index.html'}));
  app.get('/project-info',(_req,res)=>res.type('text/plain').sendFile(join(root,'docs/superpowers/specs/2026-10-23-pageprism-mvp-design.md')));
  if(existsSync(join(root,'dist/index.html'))){
    app.use(express.static(join(root,'dist')));
    app.use((_req,res)=>res.sendFile(join(root,'dist/index.html')));
  } else app.use((_req,res)=>res.status(404).send('请打开 http://127.0.0.1:5173 开发界面，或先运行 npm run build。'));
  app.use((error: Error & {status?:number},_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    const status=error.status||500;
    res.status(status).json({error:status===404?'没有找到这个文件。':status===413?'提交的内容太长。':status===400?'请求格式不正确。':'本地服务暂时无法完成请求。'});
  });
  return new Promise((resolveServer,reject)=>{
    const server=app.listen(port,'127.0.0.1',()=>{
      app.locals.origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
      resolveServer(server);
    });
    server.on('error',reject);
    server.on('close',()=>{for(const controller of controllers.values())controller.abort();});
  });
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT || 4317);
  const server=await startServer(port);
  console.log(`页棱镜 PagePrism: http://127.0.0.1:${port}`);
  const stop=()=>{server.close();server.closeAllConnections();};
  process.once('SIGINT',stop); process.once('SIGTERM',stop);
}
