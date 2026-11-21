/* Shared site navigation only. Broadcast/browser-source pages never mount this shell. */
(() => {
  'use strict';
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const links = {
    home: ['/', 'Home'], terms: ['/terms', 'Terms'], privacy: ['/privacy', 'Privacy'],
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
  const isPublic = ['home','login','privacy','terms'].includes(current);
  const gamePages = ['games','quick','quiz','hill'];
  const gamePage = gamePages.includes(current);
  const studioPages = ['songs','games','graphics','polaroid','analytics','coach','moderators'];
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
  brand.href = isPublic ? '/' : gamePage ? '/admin/games' : '/admin';
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
  const renderLinks = keys => {
    nav.replaceChildren(...keys.map(key=>{
      const [url,name] = links[key], a=make('a',null,name);
      a.href=url;
      if(key===current) a.setAttribute('aria-current','page');
      if(key==='games' && (gamePage || current==='quizPreview') && current!=='games') a.dataset.sectionActive='true';
      return a;
    }));
  };
  renderLinks(isPublic ? ['home','terms','privacy','login'] : gamePage ? gamePages : current==='quizPreview' ? [...studioPages.slice(0,2),current,...studioPages.slice(2)] : studioPages);
  header.append(bar,nav); body.prepend(skip,header);
  if (gamePage) {
    // These four pages are available to moderators. Default their navigation to game tools.
    fetch('/admin/games/session',{cache:'no-store',credentials:'same-origin'})
      .then(r=>r.ok ? r.json() : null).then(session=>{
        if(session?.user?.role!=='owner') return;
        // The game pages already have page-specific launch/settings links. Include a current-page
        // link on deep pages so screen-reader navigation still identifies the active destination.
        const keys=studioPages.slice();
        if(current!=='games') keys.splice(keys.indexOf('games')+1,0,current);
        renderLinks(keys); brand.href='/admin';
      }).catch(()=>{});
  }
})();
