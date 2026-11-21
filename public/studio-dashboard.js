(() => {
  'use strict';
  const byId = suffix => document.getElementById('dash-' + suffix);
  const services = {spotify:'Spotify',tikfinity:'TikFinity',streamerbot:'Streamer.bot',connector:'PC connector'};
  const labels = {connected:'Connected',connecting:'Connecting',disconnected:'Disconnected',unknown:'Unavailable'};
  const themes = {classic:'Classic',spooktober:'Spooktober',vicecity:'Vice City'};
  const formatter = new Intl.DateTimeFormat(undefined,{dateStyle:'short',timeStyle:'short'});
  let lastUpdate = null, loading = false;
  const node = (tag,text,cls) => { const n=document.createElement(tag); n.textContent=text; if(cls)n.className=cls; return n; };
  const text = (id,t) => {byId(id).textContent=t;};
  function connections(value) {
    const list=byId('services'), rows=[], connected=Object.keys(services).filter(k=>value?.[k]?.state==='connected').length;
    for(const [key,name] of Object.entries(services)) {
      const info=value?.[key], state=Object.hasOwn(labels,info?.state)?info.state:'unknown';
      const row=node('li',''), head=node('div','','dash-row'), badge=node('span',labels[state],'dash-badge');
      badge.dataset.state=state;head.append(node('strong',name),badge);row.append(head);
      if(info?.detail) row.append(node('p',info.detail,'dash-detail'));
      rows.push(row);
    }
    list.replaceChildren(...rows);text('total',connected+' of '+rows.length+' connected');
  }
  function requests(items) {
    const list=byId('requests');
    if (!Array.isArray(items)) {list.replaceChildren(node('li','Request history unavailable.'));return;}
    if(!items.length){list.replaceChildren(node('li','No song requests yet.'));return;}
    list.replaceChildren(...items.slice(0,6).map(req=>{
      const li=node('li',''), head=node('div','','dash-row');
      head.append(node('strong',req.track||'Unknown track'));if(req.status)head.append(node('span',req.status,'dash-detail'));li.append(head);
      const bits=[req.artist,req.username && ('From '+req.username),req.platform].filter(Boolean);
      if(req.at){const d=new Date(req.at);if(!Number.isNaN(d.getTime()))bits.push(formatter.format(d));}
      if(bits.length)li.append(node('p',bits.join(' · '),'dash-detail'));return li;
    }));
  }
  function render(s) {
    if (!s || !Object.hasOwn(s,'songRequestsEnabled')) throw new Error('Missing dashboard data');
    text('open',s.songRequestsEnabled===true?'Open':s.songRequestsEnabled===false?'Closed':'Unavailable');
    const queue=[s.queueEnabled===true?'Live queue on':s.queueEnabled===false?'Live queue off':'Queue unavailable'];
    if(Number.isFinite(s.duplicateSongCooldownMinutes))queue.push(s.duplicateSongCooldownMinutes>0?s.duplicateSongCooldownMinutes+' min repeat cooldown':'No repeat cooldown');
    text('queue',queue.join(' · '));
    text('theme',themes[s.theme]||(s.theme===null?'Not selected':'Unavailable'));
    text('game',s.game||'None selected');
    connections(s.connections);requests(s.requests);
  }
  async function refresh() {
    if(loading)return;
    loading=true;byId('refresh').disabled=true;byId('refresh').textContent='Refreshing…';
    try{
      const r=await fetch('/admin/dashboard/state',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});
      if(r.status===401){location.replace('/admin/login?returnTo=%2Fadmin%2Fdashboard');return;}
      if(!r.ok)throw Error();render(await r.json());
      lastUpdate=new Date();text('updated','Updated '+formatter.format(lastUpdate));byId('alert').hidden=true;
    }catch{
      text('alert',lastUpdate?'Refresh failed. Showing the last successful update.':'Dashboard data could not be loaded. Retry to check the current status.');byId('alert').hidden=false;
      if(!lastUpdate){
        text('updated','No update available');for(const id of ['open','theme','game'])text(id,'Unavailable');
        byId('services').replaceChildren(node('li','Connection status unavailable.'));requests(null);
      }
    }finally{loading=false;byId('refresh').disabled=false;byId('refresh').textContent=byId('alert').hidden?'Refresh':'Retry';}
  }
  byId('refresh').addEventListener('click',refresh);refresh();
  setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);
})();
