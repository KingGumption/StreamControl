const $=id=>document.getElementById(id);let state, ready=false, busy=false, refreshVersion=0;
async function api(path,body){const r=await fetch('/admin/'+path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(r.status===401){location.assign('/admin/login?returnTo='+encodeURIComponent(location.pathname+location.search));throw Error('Please sign in.');}const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;}
function canControl(){return state&&(state.user.role==='owner'||state.controlEnabled);}
async function run(fn,confirmation='Saved.') {
  if(busy) return;
  busy=true;
  refreshVersion++;
  buttons();
  try {
    await fn();
    $('message').textContent=confirmation;
  } catch(error) {
    $('message').textContent=error.message;
  } finally {
    try { await refresh(); } catch(error) { offline(error); }
    busy=false;
    buttons();
  }
}
function buttons() {
  const enabled=canControl() && !busy;
  const selection=$('presetGame').value;
  const game=state?.catalog.find(item=>item.id===selection);
  $('presetGame').disabled=!state || busy;
  document.querySelectorAll('#fields input,#fields select').forEach(input=>input.disabled=!enabled);
  $('takeAir').disabled=!enabled || !game || Boolean(state?.active);
  $('takeAir').textContent=selection==='quiz'?'Open quiz lobby':game?'Launch '+game.name:'Launch game';
  const activeName=state?.catalog.find(item=>item.id===state.active)?.name;
  const hint=game && activeName && state.active!==selection?'Take '+activeName+' off the overlay before launching '+game.name+'.':'';
  $('launchHint').textContent=hint;
  $('launchHint').hidden=!hint;
  $('savePreset').disabled=!enabled || !game;
  const live=state?.active;
  const phase=live==='quiz'?state.quiz.phase:live==='hill'?state.hill.phase:state?.arcade.phase;
  const lobby=live==='quiz' && phase==='lobby';
  $('start').hidden=!lobby;
  $('start').disabled=!enabled || !lobby || !state.quiz.players;
  $('start').textContent='Start first question';
  $('stop').hidden=!live;
  $('stop').disabled=!enabled || !live;
  $('stop').textContent=phase==='completed'?'Clear results from overlay':'Take game off overlay';
  const nextLabel=live==='hill'?{topic:'Close topic vote',battle:'Close battle vote',champion:'Start next game'}[phase]:
    live==='quiz'?{question:'Close answers and reveal',reveal:'Start next question'}[phase]:
    {question:'Reveal round result',reveal:'Start next round'}[phase];
  $('next').hidden=!live || !nextLabel;
  $('next').disabled=!enabled || !live || !nextLabel;
  if(nextLabel) $('next').textContent=nextLabel;
  for(const id of ['mods','createToken','revokeToken']) $(id).disabled=busy || state?.user.role!=='owner';
}
function offline(error) {
  state=null;
  $('status').textContent='Game controls unavailable. Reconnecting…';
  $('message').textContent=error.message;
  buttons();
}
function field(name,title,value,min,max) {
  const label=document.createElement('label');
  label.textContent=title;
  const input=document.createElement('input');
  Object.assign(input,{name,type:'number',min,max,value,required:true});
  const range=document.createElement('small');
  range.textContent=min+'–'+max;
  label.append(input,range);
  return label;
}

function fields() {
  const id=$('presetGame').value, preset=state.presets[id]||{}, holder=$('fields');
  holder.replaceChildren();
  if(!id)return;
  if(id==='quiz'){
    holder.append(
      field('questionCount','Questions',preset.questionCount??10,1,15),
      field('answerSeconds','Seconds to answer',preset.answerSeconds??20,5,120),
      field('lobbySeconds','Seconds to join',preset.lobbySeconds??30,5,300)
    );
  }else if(id==='hill'){
    const label=document.createElement('label'), select=document.createElement('select');
    label.textContent='Topic category';
    select.name='category';
    select.add(new Option('All topics','all'));
    for(const category of state.hillCategories)select.add(new Option(category[0].toUpperCase()+category.slice(1),category));
    select.value=preset.category||'all';
    label.append(select);
    holder.append(label);
  }else if(id==='boss'){
    const note=document.createElement('p');
    note.textContent='The battle ends when the boss or the party runs out of health.';
    holder.append(field('seconds','Seconds per turn',preset.seconds??20,10,60),note);
  }else{
    holder.append(
      field('rounds','Rounds',preset.rounds??(id==='number'?7:5),3,10),
      field('seconds','Seconds per round',preset.seconds??20,10,60)
    );
  }
}
function overlays(){if(state?.user.role!=='owner'){ $('links').replaceChildren();return; }const params=new URLSearchParams();if($('theme').value)params.set('theme',$('theme').value);params.set('volume',$('overlayVolume').value);if($('overlayMuted').checked)params.set('muted','1');const suffix='?'+params.toString();$('links').replaceChildren(...[['All Games','/games'],['Polaroid','/polaroid'],['Songs','/overlay']].map(([name,path])=>{const a=document.createElement('a');a.textContent=name;a.href=path+suffix;a.target='_blank';return a;}));}
async function refresh(){
 const version=++refreshVersion;
 const latest=await api('games/state');
 if(version!==refreshVersion) return;
 state=latest;
 $('owner').hidden=state.user.role!=='owner';
 $('device').hidden=$('overlaySetup').hidden=state.user.role!=='owner';
 $('mods').checked=state.controlEnabled;
 if(!ready){
   const requested=new URLSearchParams(location.search).get('game');
   for(const game of state.catalog) $('presetGame').add(new Option(game.name,game.id));
   $('presetGame').value=state.catalog.some(game=>game.id===requested)?requested:state.active||'';
   ready=true;
   fields();
   overlays();
 }
 renderLive();
 buttons();
}
function renderLive(){
  const section=$('live');
  const setup=$('preset');
  if(state.active && section.nextElementSibling!==setup) setup.before(section);
  else if(!state.active && section.previousElementSibling!==$('message')) $('message').after(section);
  if(!state.active){
    $('liveHeading').textContent='Live controls';
    $('status').textContent=(state.quiz.lobbyNotice || 'No game on the overlay')+(!canControl()?' · View only':'');
    return;
  }
  const id=state.active;
  const g=id==='quiz'?state.quiz:id==='hill'?state.hill:state.arcade;
  const labels={lobby:'Lobby open',question:id==='quiz'?'Accepting answers':'Round in progress',reveal:'Showing results',completed:'Final results',topic:'Choosing a topic',battle:'Battle vote open',champion:'Champion on screen'};
  const parts=[labels[g.phase] || 'On the overlay'];
  if(g.round>0 && !['topic','lobby'].includes(g.phase)) parts.push((id==='quiz'?'Question ':'Round ')+g.round);
  if(Number.isInteger(g.players)) parts.push(g.players+' '+(g.players===1?'player':'players'));
  const deadline=id==='quiz'?{lobby:g.lobbyEndsAt,question:g.acceptUntil,reveal:g.nextQuestionAt}[g.phase]:
    g.phase==='completed'?null:id==='hill'?Date.parse(g.endsAt):g.endsAt;
  if(deadline) parts.push(Math.max(0,Math.ceil((deadline-Date.now())/1000))+'s remaining');
  if(g.phase==='lobby' && !g.players) parts.push('Waiting for a player to join');
  if(!canControl()) parts.push('View only');
  $('liveHeading').textContent=state.catalog.find(game=>game.id===id).name;
  $('status').textContent=parts.join(' · ');
}
$('mods').onchange=()=>run(()=>api('moderators/handoff',{enabled:$('mods').checked}));for(const action of ['start','next','stop'])$(action).onclick=()=>{run(()=>api('games/action',{action,game:state.active}),{start:'Quiz started.',next:'Game advanced.',stop:'Game stopped.'}[action]);};
$('presetGame').onchange=()=>{
  const url=new URL(location.href);
  if($('presetGame').value) url.searchParams.set('game',$('presetGame').value);
  else url.searchParams.delete('game');
  history.replaceState(null,'',url);
  fields();
  buttons();
  $('message').textContent='';
};
$('preset').onsubmit=event=>{
  event.preventDefault();
  const game=$('presetGame').value;
  if(busy || !canControl() || !game || !event.target.reportValidity()) return;
  const values=Object.fromEntries(new FormData(event.target));
  if(event.submitter===$('savePreset')){
    run(()=>api('games/preset',{game,values}),'Default settings saved.');
  }else if(!state.active){
    const name=state.catalog.find(item=>item.id===game).name;
    run(()=>api('games/action',{action:'launch',game,values}),game==='quiz'?'Quiz lobby opened.':'Launched '+name+'.');
  }
};
$('theme').onchange=overlays;$('overlayMuted').onchange=overlays;$('overlayVolume').oninput=overlays;
$('createToken').onclick=()=>run(async()=>{$('token').textContent=(await api('games/device-token',{})).token;});$('revokeToken').onclick=()=>run(async()=>{await api('games/device-token/revoke',{});$('token').textContent='Key revoked.';});
refresh().catch(offline);
setInterval(()=>{if(!busy)refresh().catch(offline);},1500);
