(() => {
  const host=document.getElementById('gameHost');
  const routes={quiz:'/quiz',hill:'/king-of-the-hill',snacks:'/chat-games',escape:'/chat-games',higher:'/chat-games',split:'/chat-games',boss:'/chat-games',number:'/chat-games'};
  const params=new URLSearchParams(location.search),theme=params.get('theme'),forward=new URLSearchParams();
  if(['halloween','ghost','slime'].includes(theme))forward.set('theme',theme);
  if(params.get('muted')==='1')forward.set('muted','1');
  if(params.has('volume')&&Number.isFinite(Number(params.get('volume'))))forward.set('volume',String(Math.max(0,Math.min(100,Number(params.get('volume'))))));
  const suffix=forward.size?'?'+forward.toString():'';
  let selected=null;
  function render({active}) {
    const next=Object.hasOwn(routes,active)?active:null;
    if(next===selected)return;
    selected=next;
    // Removing the previous frame also closes its event stream and audio.
    host.replaceChildren();
    if(!next)return;
    const frame=document.createElement('iframe');
    frame.id='gameFrame';frame.title='Live game';frame.allow='autoplay';
    frame.src=routes[next]+suffix;
    host.append(frame);
  }
  const events=new EventSource('/games/events');
  events.addEventListener('game-selection',event=>render(JSON.parse(event.data)));
  // EventSource reconnects with a fresh selection, including after deployments.
})();
