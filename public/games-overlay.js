(() => {
  const host=document.getElementById('gameHost');
  const routes={word:'/word-vault',heist:'/audience-games',rival:'/audience-games',quiz:'/quiz',hill:'/king-of-the-hill',snacks:'/chat-games',escape:'/chat-games',higher:'/chat-games',split:'/chat-games',boss:'/chat-games',number:'/chat-games'};
  const params=new URLSearchParams(location.search),theme=params.get('theme'),forward=new URLSearchParams();
  if(['classic','spooktober','vicecity','christmas','halloween','ghost','slime'].includes(theme))forward.set('theme',theme);
  if(params.get('muted')==='1')forward.set('muted','1');
  if(params.has('volume')&&Number.isFinite(Number(params.get('volume'))))forward.set('volume',String(Math.max(0,Math.min(100,Number(params.get('volume'))))));

  const path=location.pathname.replace(/\/$/,'');
  const view=path==='/games/corner'?'corner':path==='/games/full'?'full':'combined';
  host.dataset.view=view;
  let selected=null;
  function render({active,layout}) {
    const compact=layout==='compact';
    const visible=view==='combined'||(compact?view==='corner':view==='full');
    const next=visible&&Object.hasOwn(routes,active)?active:null;
    const key=next?next+'-'+compact:null;
    if(key===selected)return;
    selected=key;
    host.classList.toggle('corner',compact&&view==='combined');
    // Removing the previous frame also closes its event stream and audio.
    host.replaceChildren();
    if(!next)return;
    const frame=document.createElement('iframe');
    frame.id='gameFrame';frame.title='Live game';frame.allow='autoplay';
    const options=new URLSearchParams(forward);
    if(compact)options.set('layout','compact');
    const route=compact&&next!=='word'?'/arcade-corner':routes[next];
    frame.src=route+(options.size?'?'+options:'');
    host.append(frame);
  }
  const events=new EventSource('/games/events');
  events.addEventListener('game-selection',event=>render(JSON.parse(event.data)));
  events.onerror=()=>render({active:null});
  // EventSource reconnects with a fresh selection, including after deployments.
})();
