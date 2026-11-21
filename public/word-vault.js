(() => {
  const byId = id => document.getElementById(id);
  const cabinet = document.querySelector('.cabinet');
  const compact = new URLSearchParams(location.search).get('layout') === 'compact';
  document.documentElement.classList.toggle('compact', compact);
  const markers = {exact:'✓',present:'↔',absent:'×'};
  const labels = {exact:'correct position',present:'wrong position',absent:'absent'};
  const examples = ['CRANE','FROST','GLYPH','BLADE','PEARL','BRICK','CHESS'];
  let lastBoard = '';
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
    byId('clock').textContent = endsAt ? Math.max(0,Math.ceil((endsAt-Date.now())/1000)) + 's' : '';
  }

  function render({active,game}) {
    cabinet.hidden = active !== 'word' || !game || game.phase === 'idle';
    if (cabinet.hidden) { endsAt = null; return; }
    const {rows,attemptLimit,round,rounds,candidates,score,phase} = game;
    const guessing = phase === 'guessing';
    const lead = candidates[0];
    const runnerUp = candidates[1];
    const used = rows.length;
    endsAt = game.endsAt;
    tick();
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
    const example = examples.find(word => !rows.some(row => row.word === word));
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
