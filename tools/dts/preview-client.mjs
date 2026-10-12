// Build-time helper: this client is injected only by `wutu dev`.
export function previewClient() {
  const key='__wutu_preview:'+location.pathname;
  const controls=()=>[...document.querySelectorAll('input,textarea,select')].filter(n=>!['password','file'].includes(n.type));
  function restore(){
    if(!document.documentElement.hasAttribute('data-utu-ready'))return false;
    try{const saved=JSON.parse(sessionStorage.getItem(key)??'null');sessionStorage.removeItem(key);if(!saved)return true;
      const fields=controls();for(const [i,state]of saved.fields.entries()){const field=fields[i];if(!field)continue;field.value=state.value;if('checked'in field)field.checked=state.checked;field.dispatchEvent(new Event(field.type==='checkbox'||field.tagName==='SELECT'?'change':'input',{bubbles:true}));}
      queueMicrotask(()=>{const field=fields[saved.focus];field?.focus({preventScroll:true});try{if(saved.selection)field?.setSelectionRange(...saved.selection);}catch{}scrollTo(...saved.scroll);});
    }catch{}return true;
  }
  if(!restore()){const observer=new MutationObserver(()=>{if(restore())observer.disconnect();});observer.observe(document.documentElement,{attributes:true});}
  const events=new EventSource('/__wutu_events');
  events.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.reload){
      const fields=controls(),focused=document.activeElement;
      try{sessionStorage.setItem(key,JSON.stringify({fields:fields.map(n=>({value:n.value,checked:n.checked})),focus:fields.indexOf(focused),selection:focused&&'selectionStart'in focused?[focused.selectionStart,focused.selectionEnd]:null,scroll:[scrollX,scrollY]}));}catch{}
      location.reload();
    }
    if(message.error){let box=document.getElementById('__wutu_error');if(!box){box=document.createElement('pre');box.id='__wutu_error';box.style='position:fixed;inset:12px;z-index:2147483647;overflow:auto;padding:24px;background:#231b20;color:#ffdadc;white-space:pre-wrap;font:14px/1.6 monospace';document.body.append(box);}box.textContent='Wutu build error\n\n'+message.error;}
  };
}
