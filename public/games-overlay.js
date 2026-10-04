(() => {
  const host=document.getElementById('gameHost');
  const routes={quiz:'/quiz',hill:'/king-of-the-hill',snacks:'/chat-games',escape:'/chat-games',higher:'/chat-games',split:'/chat-games',boss:'/chat-games',number:'/chat-games'};
  const theme=new URLSearchParams(location.search).get('theme');
  const suffix=['halloween','ghost','slime'].includes(theme)?'?theme='+theme:'';
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
