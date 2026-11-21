/* Shared site navigation only. Broadcast/browser-source pages never mount this shell. */
(() => {
  'use strict';
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const links = {
    empty: ['/admin/workspace','Workspace'], home: ['/admin/dashboard', 'Dashboard'], terms: ['/terms', 'Terms'], privacy: ['/privacy', 'Privacy'],
    quizPreview: ['/admin/quiz/preview', 'Quiz preview'], login: ['/admin/login', 'Sign in'], songs: ['/admin', 'Song requests'],
    games: ['/admin/games', 'Games'], quick: ['/admin/games/quick', 'Quick controls'],
    quiz: ['/admin/quiz', 'Quiz'], hill: ['/admin/king-of-the-hill', 'King of the Hill'],
    graphics: ['/admin/graphics', 'Graphics'], analytics: ['/admin/analytics', 'Analytics'],
    coach: ['/admin/content-coach', 'Content Coach'], polaroid: ['/admin/polaroid', 'Polaroid'],
    moderators: ['/admin/moderators', 'Moderators']
  };
  const current = ['/admin/ui','/admin/stream-engagement'].includes(path)
    ? 'songs' : Object.keys(links).find(key => links[key][0] === path);
  if (!current || document.querySelector('.eng-shell')) return;
  const isPublic = ['login','privacy','terms'].includes(current);
  const gamePages = ['games','quick','quiz','hill'];
  const gamePage = gamePages.includes(current);
  const studioPages = ['home','songs','games','graphics','polaroid','analytics','coach','moderators'];
  const body = document.body;
  body.classList.add('engagement-site');
  body.dataset.engagementArea = isPublic ? 'public' : 'studio';
  body.dataset.engagementPage = current;
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  const hide = e => { if (e) { e.hidden = true; e.classList.add('eng-replaced'); } };
  // Only retire duplicated navigation; keep live status, page actions and headings in place.
  document.querySelectorAll('.admin-nav, nav[aria-label="Admin pages"], .site-header, .legal-links, form[action="/admin/logout"]').forEach(hide);
  if (current === 'coach') hide(document.querySelector('main.shell > header'));
  if (current === 'graphics') hide(document.querySelector('main > a:first-child[href="/admin"]'));
  const content = document.querySelector('main') || document.querySelector('body > .shell, body > .preview-shell');
  if (!content) return;
  if (content.tagName !== 'MAIN') content.setAttribute('role','main');
  if (!content.id) content.id = 'eng-content';
  if (!content.hasAttribute('tabindex')) content.tabIndex = -1;
  const skip = make('a','eng-skip','Skip to content');
  skip.href = '#' + content.id;
  const header = make('header','eng-shell');
  const bar = make('div','eng-bar');
  const brand = make('a','eng-brand');
  brand.href = isPublic ? '/' : gamePage ? '/admin/games' : '/admin/dashboard';
  const monogram = make('span','eng-mark','SE');
  monogram.setAttribute('aria-hidden','true');
  brand.append(monogram,make('span',null,'Stream Engagement'));
  const context = make('span','eng-context', isPublic ? 'KingGumption' : links[current][1]);
  const toggle = make('button','eng-toggle','Menu');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls','eng-site-navigation');
  toggle.setAttribute('aria-expanded','false');
  const nav = make('nav','eng-nav');
  nav.id = 'eng-site-navigation';
  nav.setAttribute('aria-label',isPublic ? 'Site navigation' : 'Workspace navigation');
  function menu(open) {
    header.dataset.menu = open ? 'open' : 'closed';
    toggle.setAttribute('aria-expanded',String(open));
    toggle.textContent = open ? 'Close menu' : 'Menu';
  }
  menu(false);
  toggle.addEventListener('click',()=>menu(header.dataset.menu !== 'open'));
  header.addEventListener('keydown',event=>{
    if (event.key === 'Escape' && header.dataset.menu === 'open') {
      menu(false); toggle.focus();
    }
  });
  bar.append(brand,context,toggle);
  if (!isPublic) {
    const account = make('form','eng-account');
    account.method='post'; account.action='/admin/logout';
    const logout=make('button',null,'Log out');
    logout.type='submit'; logout.dataset.adminLogout='';
    account.append(logout); bar.append(account);
  }
  if (!isPublic) {
    const group=make('ul','eng-connections');
    group.setAttribute('aria-label','Live connections');
    const services={spotify:'Spotify API',spotifyApp:'Spotify app',tikfinity:'TikFinity',streamerbot:'Streamer.bot',connector:'PC connector'};
    const states={connected:'Connected',disconnected:'Disconnected',connecting:'Connecting',unknown:'Unavailable'};
    const labels=[];
    for(const [key,name] of Object.entries(services)){
      const item=make('li'), chip=make('span','eng-service');
      const icon=make('span','eng-service-mark','?');
      icon.setAttribute('aria-hidden','true');chip.append(icon,make('span',null,name));
      function set(state){
        const label=name+': '+(key==='spotifyApp'?({connected:'Running',disconnected:'Closed',unknown:'Unavailable'})[state]:states[state]);
        if(chip.dataset.state===state)return;
        chip.dataset.state=state;chip.title=label;
        chip.setAttribute('aria-label',label);chip.lastChild.setAttribute('aria-hidden','true');
        icon.textContent={connected:'✓',disconnected:'×',connecting:'…',unknown:'?'}[state];
      }
      chip.setAttribute('role','img');
      set('unknown');labels.push([key,set]);item.append(chip);group.append(item);
    }
    bar.insertBefore(group,toggle);
    let pending=false;
    async function loadHealth(){
      if(pending||document.hidden)return;pending=true;
      try {
        const response=await fetch('/admin/workspace/connections',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw Error();
        const {connections}=await response.json();
        for(const [key,set] of labels){const s=connections?.[key]?.state;set(Object.hasOwn(states,s)?s:'unknown');}
      }catch{for(const [,set] of labels)set('unknown');}
      finally{pending=false;}
    }
    loadHealth();
    document.addEventListener('visibilitychange',loadHealth);
    window.addEventListener('pageshow',event=>{if(event.persisted)loadHealth();});
    setInterval(loadHealth,10000);
  }
  const renderLinks = keys => {
    nav.replaceChildren(...keys.map(key=>{
      const [url,name] = links[key], a=make('a',null,name);
      a.href=url;
      if(key===current) a.setAttribute('aria-current','page');

      return a;
    }));
  };
  const allowed=body.dataset.sections?.split(' ') || studioPages;
  const keys=studioPages.filter(k=>allowed.includes(k));
  if((gamePage||current==='quizPreview') && current!=='games')keys.splice(keys.indexOf('games')+1,0,current);
  brand.href=isPublic?'/':'/admin/workspace';
  renderLinks(isPublic?['terms','privacy','login']:keys);
  header.append(bar,nav);body.prepend(skip,header);
  if(body.hasAttribute('data-sections')){
    async function checkAccess(){
      if(document.hidden)return;
      try {
        const response=await fetch('/admin/games/session',{cache:'no-store'});
        if(response.status===401){location.replace('/admin/login');return;}
        if(!response.ok)return;
        const {sections,songControls}=await response.json();
        if(sections?.join(' ')===body.dataset.sections && (songControls||[]).join(' ')!==body.dataset.songControls){location.reload();return;}
        if(sections?.join(' ')!==body.dataset.sections)location.replace('/admin/workspace');
      } catch { /* Retry when the workspace is reachable. */ }
    }
    window.addEventListener('pageshow',event=>{if(event.persisted)checkAccess()});
    document.addEventListener('visibilitychange',checkAccess);
    setInterval(checkAccess,15000);
    const groups={quick:'games',quiz:'games',hill:'games',quizPreview:'games'};
    for(const a of content.querySelectorAll('a[href]')){
      const url=new URL(a.href,location.href);
      if(url.origin!==location.origin)continue;
      const key=Object.keys(links).find(k=>links[k][0]===url.pathname);
      if(key && !allowed.includes(groups[key]||key) && !isPublic)a.hidden=true;
    }
  }
})();
