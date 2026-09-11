import {el} from './evidence.js';
export async function mountNotes(container,scope){
 const form=el('div','chat-note-form');container.replaceChildren(form);
 const verdict=el('select');verdict.setAttribute('aria-label','聊天评价标签');
 for(const [v,t] of [['neutral','普通笔记'],['agree','✓ 认同 / 表现良好'],['issue','! 发现问题'],['question','? 待验证']]){const o=el('option','',t);o.value=v;verdict.append(o)}
 const input=el('textarea');input.maxLength=30000;input.placeholder='写下你对本次调用的评价…';input.setAttribute('aria-label','聊天逐步评价');
 const save=el('button','','保存评价'),reload=el('button','','重新载入'),status=el('p','chat-note-status','载入云端评价…'),actions=el('div','chat-note-actions');actions.append(save,reload);form.append(verdict,input,actions,status);
 const key='spatial-review-draft:'+scope;let revision=0,dirty=false,conflict=null,saving=false,timer;
 input.disabled=verdict.disabled=save.disabled=true;
 const draft=()=>{try{localStorage.setItem(key,JSON.stringify({note:input.value,verdict:verdict.value,baseRevision:revision,at:Date.now()}))}catch{}};
 function conflictUI(current){conflict=current;status.textContent='云端已有新版本；本地草稿已保留。';status.classList.add('error');const b=el('button','','保留我的草稿，覆盖最新云端版本');b.onclick=()=>{revision=conflict?.revision??0;conflict=null;persist()};status.append(el('br'),b)}
 async function persist(){
  if(!dirty||saving||conflict)return;saving=true;save.disabled=true;status.textContent='保存中…';const sent={note:input.value,verdict:verdict.value,revision};
  try{const r=await fetch('/api/notes/'+encodeURIComponent(scope),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(sent)});const d=await r.json();if(r.status===409){conflictUI(d.current);return}if(!r.ok)throw new Error();revision=d.revision;dirty=input.value!==sent.note||verdict.value!==sent.verdict;status.classList.remove('error');status.textContent='已保存到云端';if(!dirty)localStorage.removeItem(key);else{draft();timer=setTimeout(persist,100)}}
  catch{status.textContent='云端保存失败，草稿已留在本机；可重试。';status.classList.add('error');draft()}
  finally{saving=false;save.disabled=false}
 }
 function edit(){dirty=true;draft();status.textContent='本地草稿已保存，准备同步…';clearTimeout(timer);timer=setTimeout(persist,800)}
 input.oninput=verdict.onchange=edit;save.onclick=persist;reload.onclick=()=>{if(dirty&&!confirm('载入云端版本将替换本地草稿，是否继续？'))return;clearTimeout(timer);localStorage.removeItem(key);mountNotes(container,scope)};
 try{const r=await fetch('/api/notes/'+encodeURIComponent(scope),{cache:'no-store'});if(!r.ok)throw new Error();const d=await r.json();revision=d.revision;input.value=d.note;verdict.value=d.verdict;status.textContent='云端已同步';const local=localStorage.getItem(key);if(local){const x=JSON.parse(local);if(x.note!==d.note||x.verdict!==d.verdict){input.value=x.note;verdict.value=x.verdict;dirty=true;if((x.baseRevision??0)!==revision)conflictUI(d);else status.textContent='本地草稿已恢复，等待保存'}}}
 catch{status.textContent='云端暂不可用；可保存本地草稿。';status.classList.add('error');try{const x=JSON.parse(localStorage.getItem(key));if(x){input.value=x.note;verdict.value=x.verdict;revision=x.baseRevision??0;dirty=true}}catch{}}
 input.disabled=verdict.disabled=save.disabled=false;
}
