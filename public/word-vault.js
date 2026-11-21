(() => {
  const byId = id => document.getElementById(id);
  const cabinet = document.querySelector('.cabinet');
  const compact = new URLSearchParams(location.search).get('layout') === 'compact';
  document.documentElement.classList.toggle('compact', compact);
  const decoder = document.querySelector('.decoder');
  const surface = compact ? decoder : cabinet;
  const markers = {exact:'✓',present:'↔',absent:'×'};
  const labels = {exact:'correct position',present:'wrong position',absent:'absent'};
  const examples = ['CRANE','FROST','GLYPH','BLADE','PEARL','BRICK','CHESS'];
  let lastBoard = '';
  let lastPins = '';
  let renderedRound = null;
  let renderedAttempts = 0;
  let endsAt = null;

  function drawBoard(rows, limit, guessing, round) {
    const key = JSON.stringify([rows,limit,guessing,round]);
    if (key === lastBoard) return;
    lastBoard = key;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < limit; i++) {
      const attempt = rows[i];
      const row = document.createElement('div');
      row.className = 'row' + (guessing && i === rows.length ? ' current' : '');
      if(round === renderedRound && i >= renderedAttempts && attempt)row.classList.add('new-guess');
      row.setAttribute('role','listitem');
      row.setAttribute('aria-label',attempt
        ? [...attempt.word].map((letter,n) => letter + ' ' + labels[attempt.marks[n]]).join(', ')
        : 'Attempt ' + (i + 1) + ' unused');
      for (let n = 0; n < 5; n++) {
        const tile = document.createElement('span');
        const mark = attempt?.marks[n];
        tile.className = 'tile';
        tile.setAttribute('aria-hidden','true');
        if (attempt) {
          tile.textContent = attempt.word[n];
          tile.classList.add(mark);
          const symbol = document.createElement('small');
          symbol.textContent = markers[mark];
          tile.append(symbol);
        }
        row.append(tile);
      }
      fragment.append(row);
    }
    byId('board').replaceChildren(fragment);
    renderedRound = round;
    renderedAttempts = rows.length;
  }

  function tick() {
    byId(compact?'decoder-clock':'clock').textContent = endsAt ? Math.max(0,Math.ceil((endsAt-Date.now())/1000)) + 's' : '';
  }

  let decoderHistoryKey='';
  function drawDecoder(game,pins,example){
    const guessing=game.phase==='guessing', lead=game.candidates[0];
    byId('decoder-round').textContent='Vault '+game.round+'/'+game.rounds;
    byId('decoder-score').textContent=Number(game.score).toLocaleString('en-GB')+' pts';
    byId('decoder-state').textContent=guessing?'Attempt '+(game.rows.length+1)+' / '+game.attemptLimit:game.solved?'Vault opened':'Vault sealed';
    const key=JSON.stringify([game.round,game.rows,pins]);
    if(key!==decoderHistoryKey){
      decoderHistoryKey=key;
      const code=byId('decoder-code');
      code.replaceChildren(...pins.map(letter=>{
        const cell=document.createElement('b');cell.textContent=letter==='·'?'_':letter;return cell;
      }));
      code.setAttribute('aria-label','Combination: '+pins.map(letter=>letter==='·'?'unknown':letter).join(', '));
      const history=byId('decoder-history');
      history.replaceChildren(...game.rows.map(row=>{
        const line=document.createElement('div');line.className='decoder-entry';line.setAttribute('role','listitem');
        line.setAttribute('aria-label',[...row.word].map((c,i)=>c+' '+labels[row.marks[i]]).join(', '));
        for(const [i,char] of [...row.word].entries()){
          const letter=document.createElement('span'),symbol=document.createElement('small');letter.className=row.marks[i];
          letter.textContent=char;symbol.textContent=markers[row.marks[i]];letter.append(symbol);line.append(letter);
        }
        return line;
      }));
      if(!game.rows.length)history.textContent='Guesses appear here when the ballot closes.';
    }
    byId('decoder-ballot').textContent=guessing
      ? lead?'Leading: '+lead.word+' · '+lead.votes+(lead.votes===1?' vote':' votes'):'Ballot open'
      : game.streak?'Streak: '+game.streak:'Combination revealed';
    const clue=byId('decoder-clue');clue.hidden=!guessing||!game.clue;
    clue.textContent=clue.hidden?'':'Clue: '+game.clue;
    byId('decoder-command').textContent=guessing?'Type 5 letters · e.g. '+example:game.phase==='completed'?'Game complete':'Next vault incoming';
  }

  function render({active,game}) {
    surface.hidden = active !== 'word' || !game || game.phase === 'idle';
    if (surface.hidden) { endsAt = null; return; }
    const {rows,attemptLimit,round,rounds,candidates,score,phase} = game;
    const guessing = phase === 'guessing';
    const lead = candidates[0];
    const runnerUp = candidates[1];
    const used = rows.length;
    const pins=Array.from({length:5},(_,i)=>guessing ? rows.find(row=>row.marks[i]==='exact')?.word[i] || '·' : game.answer?.[i] || '·');
    const example = examples.find(word => !rows.some(row => row.word === word));
    endsAt=game.endsAt;tick();
    if(compact){drawDecoder(game,pins,example);return;}
    const pinKey=round+':'+pins.join('');
    if(pinKey!==lastPins){
      lastPins=pinKey;
      const cylinders=pins.map(letter=>{
        const n=document.createElement('span');n.className='lock-pin';n.textContent=letter;
        if(letter!=='·')n.classList.add('set');return n;
      });
      byId('spindle').replaceChildren(...cylinders);
      byId('spindle').setAttribute('aria-label',pins.map(letter=>letter==='·'?'unknown':letter).join(', '));
    }
    cabinet.dataset.lock=guessing?'closed':game.solved?'opened':'sealed';
    byId('puzzle').textContent = 'Vault ' + round + ' / ' + rounds;
    byId('score').textContent = Number(score).toLocaleString('en-GB');
    byId('attempt').textContent = guessing ? 'Try ' + Math.min(used+1,attemptLimit) + ' of ' + attemptLimit : 'Vault ' + (game.solved ? 'opened' : 'sealed');
    byId('directive').textContent = guessing ? 'Crack the vault.' : game.solved ? 'You cracked it.' : 'The lock held.';
    byId('slip-label').textContent = guessing ? (lead ? 'Leading guess' : 'Crew ballot') : 'The combination';
    byId('signal').textContent = guessing ? (lead?.word || 'No votes yet') : game.answer;
    byId('votes').textContent = !guessing ? 'Solved ' + (game.streak || 0) + ' in a row'
      : lead ? lead.votes + (lead.votes === 1 ? ' vote' : ' votes') + (runnerUp ? ' · ' + runnerUp.word + ' has ' + runnerUp.votes : '')
      : 'Send a five-letter word in chat.';
    byId('hint').textContent = guessing && game.clue ? 'Clue: ' + game.clue : '';
    byId('command').textContent = guessing ? 'Type ' + example : phase === 'completed' ? 'Game complete' : 'Next vault incoming';
    byId('instruction').textContent = guessing ? 'Chat’s top word locks in' : round + ' / ' + rounds + ' vaults played';
    cabinet.style.setProperty('--angle', (round * 30 + used * 60) + 'deg');
    drawBoard(rows,attemptLimit,guessing,round);
  }
  const events = new EventSource('/audience-games/events');
  events.addEventListener('audience-state',event => render(JSON.parse(event.data)));
  events.onerror = () => render({active:null});
  setInterval(tick,250);
})();
