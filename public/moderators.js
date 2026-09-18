const message = document.getElementById('message');
async function api(path,body) {
  const response=await fetch('/admin/moderators/'+path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;
}
async function refresh() {
  const data=await api('state');
  document.getElementById('handoffStatus').textContent=data.handoff.enabled?`Enabled until ${new Date(data.handoff.expiresAt).toLocaleString()}`:'Disabled. Only you can operate games.';
  const rows=data.accounts.map(user=>{
    const li=document.createElement('li'),label=document.createElement('span');label.textContent=user.username+(user.enabled?'':' — revoked');li.append(label);
    if(user.enabled){const button=document.createElement('button');button.textContent='Revoke access';button.onclick=()=>run(()=>api(user.id+'/revoke',{}));li.append(button);}return li;
  });
  document.getElementById('accounts').replaceChildren(...rows);
  document.getElementById('audit').replaceChildren(...(data.audit||[]).map(item=>{const li=document.createElement('li');li.textContent=`${item.timestamp} · ${item.source} · ${item.details||item.action}`;return li;}));
}
async function run(action){try{await action();message.textContent='Saved.';await refresh();}catch(error){message.textContent=error.message;}}
document.getElementById('create').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;run(async()=>{await api('create',Object.fromEntries(new FormData(form)));form.reset();});};
document.getElementById('handoff').onsubmit=event=>{event.preventDefault();run(()=>api('handoff',{enabled:true,minutes:Number(new FormData(event.currentTarget).get('minutes'))}));};
document.getElementById('takeBack').onclick=()=>run(()=>api('handoff',{enabled:false,minutes:60}));
refresh().catch(error=>{message.textContent=error.message;});
