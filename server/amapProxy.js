import express from 'express';

export function amapProxy({ key = '', securityCode = '', fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const router=express.Router(), limits=new Map();
  router.get(/.*/,async(req,res)=>{
    if(!key || !securityCode)return res.status(503).json({error:'地图安全代理尚未配置'});
    const path=req.path;
    log({phase:'request',path});
    if((path!=='/sdk'&&!/^\/v[345]\/[a-zA-Z0-9/_-]+$/.test(path))||req.originalUrl.length>8000)return res.status(400).json({error:'地图请求无效'});
    const now=Date.now();for(const [id,b] of limits)if(b.until<=now)limits.delete(id);
    const bucket=limits.get(req.ip)||{count:0,until:now+60000};
    if(bucket.count>=180||limits.size>=10000)return res.status(429).json({error:'地图请求过于频繁'});
    bucket.count++;limits.set(req.ip,bucket);
    const origin=(path==='/sdk'||path.startsWith('/v4/map/styles'))?'https://webapi.amap.com':'https://restapi.amap.com';
    const url=new URL(path==='/sdk'?'/maps':path,origin);
    for(const [name,value] of new URLSearchParams(req.originalUrl.split('?')[1]||''))if(!['key','jscode'].includes(name))url.searchParams.append(name,value);
    const jsonpCallback=url.searchParams.get('callback');
    if(jsonpCallback && !/^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/.test(jsonpCallback))return res.status(400).json({error:'无效地图回调'});
    url.searchParams.set('key',key);
    if(path==='/sdk'){
      if(!/^__travelAMap_[a-zA-Z0-9_]+$/.test(url.searchParams.get('callback')||''))return res.status(400).json({error:'回调无效'});
      url.searchParams.set('v','2.0');
    }else url.searchParams.set('jscode',securityCode);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    const cancel=()=>{if(!res.writableEnded)controller.abort()};res.on('close',cancel);
    try {
      const upstream=await fetchImpl(url,{signal:controller.signal,redirect:'error'});
      if(!upstream.ok)return res.status(502).json({error:'地图上游服务暂不可用'});
      const reader=upstream.body.getReader(),chunks=[];let size=0;
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){controller.abort();throw new Error('Too large')}chunks.push(Buffer.from(value))}
      res.set('Content-Type',upstream.headers.get('content-type')||'application/octet-stream');
      res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
      log({phase:'response',path,status:upstream.status,bytes:size,contentType:upstream.headers.get('content-type'),jsonp:!!url.searchParams.get('callback'),infoCode:Buffer.concat(chunks).toString().match(/"infocode"\s*:\s*"(\d+)"/)?.[1]});
      const body=Buffer.concat(chunks);
      // AMap serves JSONP as application/json; nosniff requires an executable MIME type.
      if(jsonpCallback && body.toString().trimStart().startsWith(`${jsonpCallback}(`))res.type('application/javascript');
      res.send(body);
    }catch{log({phase:'failure',path});if(!res.destroyed)res.status(502).json({error:'地图服务连接失败，请稍后重试'});}finally{clearTimeout(timer);res.off('close',cancel)}
  });
  return router;
}
