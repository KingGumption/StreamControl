(async () => {
  const status=document.getElementById('gamesStatus');
  const settings={quiz:'/admin/quiz',hill:'/admin/king-of-the-hill'};
  const descriptions={
    quiz:'Join with !join, answer 1–4 and use passes to survive the elimination quiz.',
    hill:'Chat votes for challengers across themed battles. Configure topics and timings.'
  };
  try {
    const response=await fetch('/admin/games/state',{cache:'no-store'});
    if(response.status===401){location.assign('/admin/login?returnTo=/admin/games');return;}
    if(!response.ok)throw Error('Unable to load games. Refresh to try again.');
    const {catalog}=await response.json();
    const cards=catalog.map(game=>{
      const card=document.createElement('a');
      card.className='game-card';
      card.href=settings[game.id]||'/admin/games/quick?game='+encodeURIComponent(game.id);
      const title=document.createElement('h3');title.textContent=game.name;
      const description=document.createElement('p');description.textContent=descriptions[game.id]||game.help;
      card.append(title,description);return card;
    });
    document.getElementById('games').replaceChildren(...cards);
    status.hidden=true;
  } catch(error) {status.textContent=error.message;}
})();
