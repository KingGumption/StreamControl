(() => {
  const byId = id => document.getElementById(id);
  const audience = byId('audience');
  const clock = byId('clock');
  const number = new Intl.NumberFormat('en-GB');
  const compactNumber = new Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:1});
  const stages = {
    'job-vote':'Rule vote',job:'Job in progress',defence:'Chat Court',verdict:'Verdict vote',
    'finale-vote':'Final vote',risk:'Final challenge',completed:'Final score',
    challenge:'Challenge',reveal:'Answer reveal',intermission:'Intermission',finale:'Final challenge',finalPick:'Host’s final pick'
  };
  let endsAt = null;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = value;
    return node;
  }
  function score(label, value, compact = false) {
    const node = document.createElement('div');
    node.className = 'score';
    const display = element('strong','score-value',compact && value >= 100000 ? compactNumber.format(value) : number.format(value));
    display.setAttribute('aria-label',number.format(value));
    if (display.textContent.length > 6) display.classList.add('long-score');
    node.append(element('span','score-label',label),display);
    return node;
  }
  function updateClock() {
    clock.hidden = !endsAt;
    if (endsAt) clock.textContent = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) + 's';
  }
  function choice(label, index, votes, total) {
    const item = document.createElement('li');
    const bar = document.createElement('div');
    bar.className = 'vote-fill';
    bar.style.width = (total ? 100 * votes / total : 0) + '%';
    item.append(element('strong','option-index',index + 1), element('span','option-label',label),
      element('span','option-votes',votes + (votes === 1 ? ' vote' : ' votes')),bar);
    return item;
  }
  function render({active,game}) {
    audience.hidden = !game || !['heist','rival'].includes(active) || game.phase === 'idle';
    if (audience.hidden) { endsAt = null; window.AdventureStage.render(null); return; }
    const heist = active === 'heist';
    audience.dataset.active = active;
    const phase = game.phase;
    const betweenMissions = !heist && phase === 'intermission';
    audience.dataset.phase = phase;
    const court=heist && ['defence','verdict'].includes(phase);
    audience.dataset.world=court?'court':active;
    audience.dataset.choices=game.options?.length || 0;
    window.AdventureStage.render({active,game});
    byId('stage').textContent = court ? 'Case '+String(game.round).padStart(2,'0')+' · '+(phase==='defence'?'Defence':'Verdict') : (heist ? 'Heist Night' : game.rivalName || 'Seasonal Rival') + ' / ' + (stages[phase] || phase);
    byId('title').textContent = court ? 'Chat Court' : game.title;
    byId('prompt').textContent = betweenMissions ? 'Each in-game death adds 1 to the ' + game.stashName + '.' : game.prompt;
    byId('round').textContent = 'Round ' + game.round + ' / ' + game.rounds;
    endsAt = game.endsAt;
    updateClock();

    const scores = heist
      ? [phase === 'completed' ? score('Banked',game.banked) : score('Crew pot',game.pot)]
      : [score('Rival’s ' + game.stashName,game.sack,betweenMissions),score('Chat recovered',game.recovered,betweenMissions)];
    if (betweenMissions) scores.push(score('Deaths',game.deaths,true));
    if (heist && ['job-vote','job'].includes(phase) && game.job) scores.push(score('Job reward',game.job.reward));
    if(!heist)for(const item of scores)item.classList.add('score-bubble');
    byId('scores').replaceChildren(...scores);
    const options = game.options || [];
    const total = (game.votes || []).reduce((sum,n) => sum + n,0);
    const lead=Math.max(0,...game.votes);
    byId('options').replaceChildren(...options.map((label,i) => {
      const item=choice(label,i,game.votes[i] || 0,total);
      item.classList.toggle('leading',lead>0&&game.votes[i]===lead);
      const correct=phase==='reveal' && game.prompt.startsWith('Answer '+(i+1)+':');
      if(correct){item.classList.add('correct');item.querySelector('.option-index').textContent='✓';}
      return item;
    }));
    const detail = (heist && ['defence','verdict'].includes(phase) && game.selectedDefence ? 'Crew defence: “' + game.selectedDefence + '”' : '')
      || (heist ? game.consequence || game.result : game.finalChallenge || game.result);
    byId('detail').textContent = detail || '';
    byId('detail').hidden = !detail || detail === game.prompt;
    audience.classList.toggle('with-detail', !byId('detail').hidden && options.length > 0);
    byId('help').textContent = phase === 'reveal' ? 'Voting closed'
      : options.length ? 'Type 1–' + options.length + ' in chat'
      : phase === 'defence' ? '!defend + your message' : '';
    byId('total').textContent = options.length ? number.format(total) + (total === 1 ? ' vote' : ' votes') : '';
  }
  const events = new EventSource('/audience-games/events');
  events.addEventListener('audience-state', event => render(JSON.parse(event.data)));
  events.onerror = () => render({active:null});
  setInterval(updateClock,250);
})();
