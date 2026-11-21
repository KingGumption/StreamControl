(() => {
  'use strict';
  const get=id=>document.getElementById(id);
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const settings={quiz:['/admin/quiz','Quiz settings'],hill:['/admin/king-of-the-hill','Hill settings']};
  const copy={
    quiz:['Elimination','Players join with !join and answer 1–4. Use a pass to skip a question or answer correctly to stay in.'],
    hill:['Head to head','Chat votes between two challengers. The winner stays to face the next one.'],
    escape:['Co-operative','Vote on the next move and collect clues before the group runs out of courage.'],
    higher:['Card game','Predict whether the next card will be higher or lower.'],
    split:['Minority vote','Vote for one of two options. Players on the smaller side score.'],
    boss:['Co-operative','Chat chooses an attack, defence or heal each turn to defeat the boss.'],
    number:['Guessing game','Guess the secret number from 1 to 100 using the clues.'],
    snacks:['Head to head','Vote in a snack showdown: Britain versus the world.']
  };
  const route=id=>'/admin/games/quick?game='+encodeURIComponent(id);
  function label(tile,game,current,writable){
    tile.card.dataset.current=String(current);tile.badge.hidden=!current;
    tile.open.textContent=!writable?'View settings':current?'Open game controls':'Prepare game';
    tile.open.setAttribute('aria-label',(!writable?'View settings for ':current?'Open game controls for ':'Prepare ')+game);
  }
  let tiles=new Map(), signature='',busy=false;
  function rebuild(catalog){
    const cards=[];tiles=new Map();
    for(const game of catalog){
      const card=make('article','','game-card'),type=make('div',copy[game.id]?.[0]||'Chat game','game-type'),badge=make('span','On overlay','on-air');
      badge.hidden=true;type.append(badge);
      const actions=make('div','','game-actions'),open=make('a','Prepare game','prepare');
      open.href=route(game.id);open.setAttribute('aria-label','Prepare '+game.name);actions.append(open);
      const extra=settings[game.id];
      if(extra){const a=make('a',extra[1],'game-settings');a.href=extra[0];actions.append(a);}
      card.append(type,make('h3',game.name),make('p',copy[game.id]?.[1]||game.help||'','game-description'),actions);
      tiles.set(game.id,{card,open,badge,name:game.name});cards.push(card);
    }
    get('games').replaceChildren(...cards);get('catalogCount').textContent=catalog.length+' games';
  }
  async function load(){
    if(document.hidden||busy)return;
    busy=true;get('retryCatalog').disabled=true;
    try{
      const r=await fetch('/admin/games/state',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(r.status===401){location.assign('/admin/login?returnTo=%2Fadmin%2Fgames');return;}
      if(!r.ok)throw Error();const state=await r.json();
      if(!Array.isArray(state.catalog))throw Error();
      const sig=JSON.stringify(state.catalog);if(signature!==sig){rebuild(state.catalog);signature=sig;}
      const active=state.catalog.find(g=>g.id===state.active);
      get('airStatus').textContent=active?active.name+' is on the overlay':'No game on the overlay';
      const writable=state.user?.role==='owner'||state.controlEnabled===true;
      get('libraryHint').textContent=writable?'Choose a game to review its settings. Nothing goes on air until you launch it.':'View game settings and check the current overlay. Your account cannot launch or change games right now.';
      get('activeLink').hidden=!active;
      if(active){get('activeLink').href=route(active.id);get('activeLink').textContent=writable?'Open current game controls':'View current game settings';}
      get('overlayLink').hidden=state.user?.role!=='owner';
      for(const game of state.catalog)label(tiles.get(game.id),game.name,game.id===active?.id,writable);
      get('gamesStatus').textContent=state.catalog.length?'':'No games available.';
      get('gamesStatus').hidden=Boolean(state.catalog.length);get('retryCatalog').hidden=true;
    }catch{get('gamesStatus').hidden=false;get('gamesStatus').textContent=tiles.size?'Could not refresh the overlay status. Retry to check which game is on the overlay.':'Could not load the game library.';get('airStatus').textContent='Status unavailable';get('activeLink').hidden=true;get('libraryHint').textContent='Choose a game to review its settings.';for(const t of tiles.values())label(t,t.name,false,false);get('retryCatalog').hidden=false;}
    finally{busy=false;get('retryCatalog').disabled=false;}
  }
  get('retryCatalog').addEventListener('click',load);document.addEventListener('visibilitychange',load);setInterval(load,15000);load();
})();
