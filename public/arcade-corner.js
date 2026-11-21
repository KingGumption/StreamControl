(() => {
  const byId = id => document.getElementById(id);
  const main = document.querySelector('main');
  const stages = Object.fromEntries([...main.querySelectorAll('section')].map(section => [section.id,section]));
  const rank = value => ({1:'A',11:'J',12:'Q',13:'K'})[value] || String(value);
  const quantity = (value,noun) => value+' '+noun+(value===1?'':'s');
  let game, stage, previousBeat;

  function tick() {
    if (!game || main.hidden) return;
    stage.querySelector('.clock').textContent = game.phase==='question' ? Math.max(0,Math.ceil((game.endsAt-Date.now())/1000))+'s' : game.phase==='completed'?'Final':'Reveal';
  }

  function higher(g,reveal) {
    const history = [...g.cardHistory];
    if (reveal) history.push(g.card);
    const ranks = history.slice(-6).map(value => {
      const item = document.createElement('b');
      item.textContent = rank(value);
      return item;
    });
    byId('run').replaceChildren(...ranks);
    byId('rank').textContent = rank(g.card);
    byId('rank-label').textContent = reveal?'Drawn rank':'Current rank';
    stages.higher.querySelector('.calls').hidden = reveal;
    byId('verdict').hidden = !reveal;
    if (!reveal) return 'Type 1 or 2 in chat';
    byId('verdict').textContent = rank(g.previousCard)+' → '+rank(g.card)+' · '+(g.result.winner===0?'Higher':'Lower');
    return quantity(g.result.counts[g.result.winner]||0,'correct call');
  }

  function split(g,reveal) {
    const counts = g.result?.counts || [0,0];
    const total = counts[0]+counts[1];
    stages.split.querySelectorAll('.lane').forEach((lane,i) => {
      lane.querySelector('strong').textContent = g.options[i].name;
      lane.querySelector('i').style.width = reveal&&total ? counts[i]*100/total+'%' : '0';
      lane.querySelector('span').textContent = reveal ? quantity(counts[i],'vote') : '';
      lane.classList.toggle('winner',reveal && g.result.winner===i);
    });
    if (!reveal) return 'Type 1 or 2 · smaller side scores';
    return g.result.winner>=0?'Side '+(g.result.winner+1)+' earns the point':'No minority · no points';
  }

  const matrix = stages.number.querySelector('.matrix');
  matrix.replaceChildren(...Array.from({length:100},()=>document.createElement('i')));
  function number(g,reveal) {
    const {low,high} = g.range;
    const guesses = new Set(g.result?.guesses);
    const finished = g.phase==='completed';
    for (const [index,cell] of [...matrix.children].entries()) {
      const n = index+1;
      cell.classList.toggle('available',!finished && n>=low && n<=high);
      cell.classList.toggle('hit',reveal && guesses.has(n));
      cell.classList.toggle('target',finished && n===g.revealedNumber);
    }
    byId('frequency').textContent = finished ? g.revealedNumber : low===high?low:low+'–'+high;
    byId('scan-label').textContent = finished?'Target located':reveal?'Range updated':'Search range';
    byId('remaining').textContent = finished ? (g.result.success?'Found by chat':'Out of guesses') : quantity(high-low+1,'possible number')+' left';
    if (!reveal) return 'Send your number in chat';
    return finished?'Search complete':guesses.size+(guesses.size===1?' distinct guess':' distinct guesses');
  }

  const renderers = {higher,split,number};
  function render(g) {
    game = g;
    main.hidden = g.phase==='idle' || !Object.hasOwn(stages,g.id);
    if (main.hidden) {previousBeat=null; return;}
    stage = stages[g.id];
    for (const section of Object.values(stages)) section.hidden = section!==stage;
    const beat = [g.gameId,g.id,g.round,g.phase].join('/');
    if (beat!==previousBeat) stage.querySelector('.instruction').textContent = renderers[g.id](g,g.phase!=='question');
    previousBeat = beat;
    const leader = g.phase==='completed' && g.leaderboard?.[0];
    const meta = stage.querySelector('.meta');
    if (leader?.score>0) {
      const name = document.createElement('span');
      name.textContent = leader.username;
      meta.replaceChildren(name,' · '+quantity(leader.score,'pt'));
    } else {
      meta.textContent = 'R'+g.round+'/'+g.rounds+(g.phase==='question'&&g.answered?' · '+g.answered+' in':'');
    }
    tick();
  }
  const events = new EventSource('/chat-games/events');
  events.addEventListener('arcade-state', e => render(JSON.parse(e.data)));
  events.onerror = () => {main.hidden=true; previousBeat=null;};
  setInterval(tick,250);
})();
