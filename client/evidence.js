const cache=new Map();
export async function get(url){
 if(!cache.has(url))cache.set(url,(async()=>{
  const resource=url.startsWith('/')?new URL(url.slice(1),import.meta.url):url,compressed=url.endsWith('.json'),r=await fetch(compressed?resource+'.gz':resource);
  if(!r.ok)throw new Error('无法读取记录：'+r.status);
  if(!compressed)return r.json();
  if(typeof DecompressionStream!=='function')throw new Error('当前浏览器不支持压缩实验记录');
  return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
 })().catch(e=>{cache.delete(url);throw e}));
 return cache.get(url);
}
export async function getRequest(url){
 const data=await get(url);if(data.format!=='spatial-blocks-v1')return data;
 const refs=data.payload.messages.map(m=>m.$block);if(data.payload.tools?.$block)refs.push(data.payload.tools.$block);
 const prefixes=[...new Set(refs.map(s=>s.slice(0,2)))];const blocks=Object.fromEntries(await Promise.all(prefixes.map(async p=>[p,await get('/data/blocks/'+p+'.json')])));
 const resolve=r=>{const b=blocks[r.$block.slice(0,2)][r.$block];if(!b)throw new Error('缺失输入消息块');return b};
 return {...data.payload,messages:data.payload.messages.map(resolve),...(data.payload.tools?.$block?{tools:resolve(data.payload.tools)}:{})};
}
export const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
export const code=t=>el('pre','chat-text',typeof t==='string'?t:JSON.stringify(t,null,2));
export function detail(label,value){const d=el('details','chat-raw');d.append(el('summary','',label),code(value));return d}
export function reviewURL(caseId,model,mode,step,tab='output'){return '/#'+new URLSearchParams({case:caseId,model,mode,view:'calls',step,tab})}
document.addEventListener('click',event=>{const link=event.target.closest('a[href^="/"]');if(!link||link.target)return;event.preventDefault();location.assign(new URL(link.getAttribute('href').slice(1),import.meta.url))});
