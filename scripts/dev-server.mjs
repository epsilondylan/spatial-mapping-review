import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import worker from '../worker/index.mjs';import {sqliteBinding} from './local-db.mjs';
await fs.mkdir('.local',{recursive:true});const root=path.resolve(process.env.REVIEW_ASSETS_DIR||'client');const DB=sqliteBinding('.local/notes.sqlite');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'};
const env={DB,ASSETS:{async fetch(request){
 const name=decodeURIComponent(new URL(request.url).pathname);const p=path.resolve(root,'.'+name);
 if(!p.startsWith(root+path.sep))return new Response('Not found',{status:404});
 try{const data=await fs.readFile(p);return new Response(data,{headers:{'content-type':mime[path.extname(p)]||'application/octet-stream'}})}
 catch{return new Response('Not found',{status:404})}
}}};
const port=Number(process.env.PORT||4173);
http.createServer(async(req,res)=>{try{let body=[];for await(const b of req)body.push(b);const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(body)});const r=await worker.fetch(request,env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))}catch(e){res.writeHead(500);res.end(String(e))}}).listen(port,'127.0.0.1',()=>console.log('Review site at http://127.0.0.1:'+port));
