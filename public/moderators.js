const message = document.getElementById('message');
async function api(path,body) {
  const response=await fetch('/admin/moderators/'+path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;
}
async function refresh() {
  const data=await api('state');
  document.getElementById('handoffStatus').textContent=data.handoff.enabled?'Enabled until you switch it off.':'Disabled. Only you can operate games.';
  document.getElementById('controlToggle').checked=data.handoff.enabled;
  const rows=data.accounts.map(user=>{
    const li=document.createElement('li'),label=document.createElement('span');label.textContent=user.username+(user.enabled?'':' — revoked');li.append(label);
    if(user.enabled){
      const box=document.createElement('fieldset'),legend=document.createElement('legend');
      legend.textContent='Visible sections for '+user.username;box.append(legend);
      const choices=data.sections.map(({id,label:text})=>{
        const label=document.createElement('label'),input=document.createElement('input');
        input.type='checkbox';input.value=id;input.checked=user.sections.includes(id);
        label.append(input,document.createTextNode(' '+text));box.append(label);return input;
      });
      const controlLabel=document.createElement('label'),control=document.createElement('input');
      control.type='checkbox';control.checked=Boolean(user.game_control);
      const games=choices.find(input=>input.value==='games');
      const sync=()=>{control.disabled=!games.checked;};sync();games.onchange=sync;
      controlLabel.append(control,document.createTextNode(' Operate games when game controls are enabled'));box.append(controlLabel);
      const save=document.createElement('button');save.type='button';save.textContent='Save access';
      save.onclick=()=>run(()=>api(user.id+'/sections',{sections:choices.filter(i=>i.checked).map(i=>i.value),gameControl:control.checked && games.checked}));
      box.append(save);li.append(box);
    }
    if(user.enabled){const button=document.createElement('button');button.textContent='Revoke access';button.onclick=()=>run(()=>api(user.id+'/revoke',{}));li.append(button);}return li;
  });
  document.getElementById('accounts').replaceChildren(...rows);
  document.getElementById('audit').replaceChildren(...(data.audit||[]).map(item=>{const li=document.createElement('li');li.textContent=`${item.timestamp} · ${item.source} · ${item.details||item.action}`;return li;}));
}
async function run(action){try{await action();message.textContent='Saved.';await refresh();}catch(error){message.textContent=error.message;}}
document.getElementById('create').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;run(async()=>{await api('create',Object.fromEntries(new FormData(form)));form.reset();});};
document.getElementById('controlToggle').onchange=event=>run(()=>api('handoff',{enabled:event.target.checked}));
refresh().catch(error=>{message.textContent=error.message;});
