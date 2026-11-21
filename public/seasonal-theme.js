(() => {
  const root=document.documentElement;
  const pinned=new URLSearchParams(location.search).get('theme');
  const game=document.currentScript?.hasAttribute('data-follow-graphics');
  const seasonal=['halloween','ghost','slime'];
  const stream=['classic','spooktober','vicecity','christmas'];

  function apply(theme) {
    if(theme==='classic' || !theme)delete root.dataset.theme;
    else root.dataset.theme=theme;
  }

  if(seasonal.includes(pinned) || (game && stream.includes(pinned))){
    apply(pinned);
    return;
  }
  if(!game)return;

  // The feed sends the saved overall theme immediately and again on reconnect.
  const events=new EventSource('/graphics/events');
  events.addEventListener('graphics',event=>{
    const {theme}=JSON.parse(event.data);
    if(theme==null || stream.includes(theme))apply(theme);
  });
})();
