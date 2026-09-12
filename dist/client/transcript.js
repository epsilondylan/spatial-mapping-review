// Keep every transmitted message available. This is a presentation window,
// not a reconstructed or edited model transcript.
export function conversationWindow(messages,previousMessages=[]){
 if(!previousMessages.length)return {visible:messages.map((_,i)=>i),history:[]};
 let lastAssistant=-1;
 messages.forEach((m,i)=>{if(m.role==='assistant')lastAssistant=i});
 // Preserve assistant-prefill requests in full rather than guessing their boundary.
 if(lastAssistant===messages.length-1)return {visible:messages.map((_,i)=>i),history:[]};
 const previousSystems=previousMessages.filter(m=>['system','developer'].includes(m.role)).map(m=>JSON.stringify(m));
 const visible=[],history=[];
 messages.forEach((m,i)=>{
  const system=['system','developer'].includes(m.role);
  const fresh=system?!previousSystems.includes(JSON.stringify(m)):i>lastAssistant;
  (fresh?visible:history).push(i);
 });
 return {visible,history};
}
