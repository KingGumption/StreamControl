(() => {
  'use strict';
  const get=id=>document.getElementById(id);
  const node=(tag,text='',cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
  const message=get('message'), toggle=get('controlToggle');
  let busy=false;
  async function api(path,body) {
    const response=await fetch('/admin/moderators/'+path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;
  }
  function checkbox(box,text,checked,value){
    const label=node('label','','access-check'),input=document.createElement('input');
    input.type='checkbox';input.checked=checked;if(value)input.value=value;
    label.append(input,document.createTextNode(text));box.append(label);return input;
  }
  function group(title){
    const box=node('fieldset'),list=node('div','','access-check-grid');box.append(node('legend',title),list);return [box,list];
  }
  function accountRow(user,data,open){
    const li=node('li','','access-account'),identity=node('div','','access-identity');
    identity.append(node('h3',user.username),node('span',user.enabled?'Active':'Revoked','access-state'));li.append(identity);
    if(!user.enabled)return li;
    const edit=node('details','','access-edit'),summary=node('summary','Manage access for '+user.username);
    edit.dataset.user=user.id;edit.open=open;li.append(edit);edit.append(summary);
    const [sections,list]=group('Visible sections');
    const choices=data.sections.map(({id,label})=>checkbox(list,label,user.sections.includes(id),id));
    const [actions,ops]=group('Stream controls');
    const games=choices.find(i=>i.value==='games'),songs=choices.find(i=>i.value==='songs');
    const control=checkbox(ops,'Operate games',Boolean(user.game_control));
    const songGrants=[['requests','Open or close song requests'],['explicit','Change explicit-track settings']].map(([id,text])=>checkbox(ops,text,(user.songControls||[]).includes(id),id));
    const sync=()=>{control.disabled=!games?.checked;songGrants.forEach(i=>i.disabled=!songs?.checked);};
    sync();games?.addEventListener('change',sync);songs?.addEventListener('change',sync);
    actions.append(node('small','Controls require their matching section. Game controls must also be enabled above.'));
    const bar=node('div','','access-actions'),save=node('button','Save access','primary'),revoke=node('button','Revoke access','access-revoke');
    save.type=revoke.type='button';bar.append(save,revoke);
    save.onclick=()=>run(()=>api(user.id+'/sections',{sections:choices.filter(i=>i.checked).map(i=>i.value),gameControl:control.checked&&Boolean(games?.checked),songControls:songGrants.filter(i=>!i.disabled&&i.checked).map(i=>i.value)}),'Access updated for '+user.username+'.',save);
    revoke.onclick=()=>{if(window.confirm('Revoke access for '+user.username+'? They will no longer be able to sign in.'))run(()=>api(user.id+'/revoke',{}),'Access revoked for '+user.username+'.',revoke);};
    edit.append(sections,actions,bar);return li;
  }
  async function refresh() {
    const data=await api('state'),opened=new Set([...document.querySelectorAll('.access-edit[open]')].map(d=>d.dataset.user));
    toggle.disabled=false;toggle.checked=Boolean(data.handoff.enabled);
    get('handoffStatus').textContent=toggle.checked?'Enabled for eligible moderators.':'Only the owner can operate games.';
    const count=data.accounts.filter(a=>a.enabled).length;get('accountCount').textContent=count+' active';
    const empty=t=>node('li',t,'access-placeholder');
    get('accounts').replaceChildren(...(data.accounts.length?data.accounts.map(u=>accountRow(u,data,opened.has(u.id))):[empty('No moderator accounts yet.')]));
    const audit=(data.audit||[]).map(item=>node('li',[item.timestamp,item.source,item.details||item.action].filter(Boolean).join(' · ')));
    get('audit').replaceChildren(...(audit.length?audit:[empty('No recent game controls.')]));
  }
  async function run(action,feedback,source) {
    if(busy)return;busy=true;
    const editUser=source.closest('.access-edit')?.dataset.user;
    const restoreFocus=source===document.activeElement;
    source.disabled=true;
    try{await action();message.textContent=feedback;try{await refresh();}catch{message.textContent=feedback+' Reload to see the latest settings.';}}
    catch(error){message.textContent=error.message;if(source===toggle)toggle.checked=!toggle.checked;}
    finally{
      source.disabled=false;busy=false;
      if(restoreFocus && editUser && !source.isConnected){
        const row=[...document.querySelectorAll('.access-edit')].find(el=>el.dataset.user===editUser);
        (row?.querySelector('summary')||get('add-link')).focus({preventScroll:true});
      }
    }
  }
  get('add-link').onclick=e=>{e.preventDefault();get('add-moderator').open=true;get('create').elements.username.focus();};
  get('create').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;run(async()=>{await api('create',Object.fromEntries(new FormData(f)));f.reset();},'Moderator account created.',f.querySelector('button'));};
  toggle.onchange=()=>run(()=>api('handoff',{enabled:toggle.checked}),'Game control setting saved.',toggle);
  refresh().catch(()=>{message.textContent='Could not load moderator settings. Reload this page to retry.';get('accounts').textContent='Accounts unavailable.';get('audit').textContent='Activity unavailable.';get('handoffStatus').textContent='Setting unavailable.';});
})();
