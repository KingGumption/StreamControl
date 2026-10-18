(() => {
  'use strict';
  const params = new URLSearchParams(location.search), preview = params.get('preview') === '1';
  const root = document.getElementById('music'), content = document.getElementById('content'), effects = document.getElementById('printEffects');
  const themes = ['classic','halloween','ghost','slime'];
  const layout = ['camera','gaming','compact'].includes(params.get('layout')) ? params.get('layout') : 'camera';
  document.documentElement.dataset.layout = layout;
  function applyTheme(style) { if (themes.includes(style)) document.documentElement.dataset.theme = style; }
  applyTheme(params.get('theme') || 'classic');
  let enabled = false, playback = null, activeRequest = null, hint = false, currentKey = '', transitioning = false;
  let nextHintAt = Date.now() + 60000, generation = 0, requestTimer = null, hintTimer = null;
  const pending = [], seen = new Set(), timers = new Set(), animations = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function later(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  function cancelTimer(id) { clearTimeout(id); timers.delete(id); }
  function animate(el, frames, options) {
    const animation = el.animate(frames, { fill:'forwards', ...options }); animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation)); return animation;
  }
  function safeImage(value) { try { const url = new URL(value, preview ? location.href : undefined); return url.protocol === 'https:' || (preview && url.origin === location.origin) ? url.href : ''; } catch { return ''; } }
  function textNode(tag, className, value) { const el = document.createElement(tag); el.className = className; el.textContent = String(value || ''); return el; }
  function makeCard(view) {
    const card = document.createElement('section'); card.className = 'music-card';
    if (view.type === 'hint') {
      card.classList.add('request-card'); card.append(textNode('div','label','PICK THE MUSIC'),textNode('div','command','!song artist – title'),textNode('div','instruction','Type your request in chat')); return card;
    }
    const track = view.track, art = safeImage(track.albumArtUrl);
    if (art) {
      const image = document.createElement('img'); image.className = 'cover'; image.alt = ''; image.src = art;
      image.addEventListener('error', () => { image.hidden = true; card.classList.add('no-cover'); }); card.append(image);
    } else card.classList.add('no-cover');
    const copy = document.createElement('div'); copy.className = 'copy';
    const label = view.type === 'queue' ? (view.playlistOnly ? 'ADDED TO PLAYLIST' : 'ADDED TO QUEUE') : 'NOW PLAYING';
    copy.append(textNode('div','label',label),textNode('div','song',track.name || 'Unknown song'),textNode('div','artist',Array.isArray(track.artists) ? track.artists.join(', ') : ''));
    if (view.type === 'queue') copy.append(textNode('div','requester','Requested by ' + view.username));
    else { const progress = document.createElement('div'); progress.className = 'progress'; progress.append(textNode('div','fill','')); copy.append(progress); }
    card.append(copy); return card;
  }
  function desired() {
    if (!enabled) return null;
    if (activeRequest) return { type:'queue', key:activeRequest.key, track:activeRequest.track, username:activeRequest.username, playlistOnly:activeRequest.status === 'partial' || activeRequest.queueEnabled === false };
    if (hint && playback) return { type:'hint', key:'hint' };
    return playback ? { type:'playing', key:'playing:' + playback.id, track:playback } : null;
  }
  function hardHide() {
    generation++; timers.forEach(clearTimeout); timers.clear(); animations.forEach(a => a.cancel()); animations.clear();
    root.hidden = true; content.replaceChildren(); effects.replaceChildren();
    pending.length = 0; activeRequest = null; hint = false; currentKey = ''; transitioning = false; requestTimer = hintTimer = null;
    nextHintAt = Date.now() + 60000;
  }
  function showNextRequest() { activeRequest = pending.shift() || null; requestTimer = null; reconcile(); }
  function settled() {
    transitioning = false;
    const wanted = desired();
    if ((wanted?.key || '') !== currentKey) { reconcile(); return; }
    if (activeRequest && !requestTimer) requestTimer = later(showNextRequest, 4000);
  }
  function slices(card) {
    const cuts = [0,21,36,47,55,69,83,100], offsets = [4,-14,25,-32,18,-7,3];
    return offsets.map((offset,i) => {
      const band = document.createElement('div'); band.className = 'print-band'; band.setAttribute('aria-hidden','true');
      band.style.clipPath = `inset(${cuts[i]}% 0 ${100-cuts[i+1]}% 0)`; band.append(card.cloneNode(true)); content.append(band);
      return { band, offset };
    });
  }
  function transition(view) {
    const version = ++generation; transitioning = true;
    const old = content.querySelector('.music-card'), next = makeCard(view);
    const commit = () => { content.replaceChildren(next); currentKey = view.key; root.hidden = false; };
    if (root.hidden || reduced.matches) {
      commit(); animate(next,[{opacity:0},{opacity:1}],{duration:180,fill:'none'}); later(settled,180); return;
    }
    // Same ink pass, paper-white interference and misregistration as the approved preview.
    effects.replaceChildren();
    const widths = [100,72,93,63,98,82,90,70,100,76,94,80,97], lefts = [0,16,3,28,0,12,6,24,0,18,4,14,1];
    for (let i=0;i<13;i++) {
      const ink = document.createElement('div'); ink.className = 'print-ink'; ink.style.cssText = `top:${i*100/13}%;left:${lefts[i]}%;width:${widths[i]}%`; effects.append(ink);
      const phase = ((i*5)%13)/13;
      animate(ink,[{transform:'scaleX(0)',offset:0},{transform:'scaleX(1.04)',offset:.38},{transform:'scaleX(1.04)',offset:.50},{transform:'scaleX(0)',offset:1}],{duration:460,delay:70+phase*70,easing:'steps(5)'});
    }
    const grit = document.createElement('div'); grit.className = 'print-grit'; effects.append(grit);
    animate(grit,[{opacity:0},{opacity:.9,offset:.1},{opacity:.9,offset:.85},{opacity:0}],{duration:575,delay:45});
    for (const [top,delay] of [[30,0],[65,395]]) {
      const line = document.createElement('div'); line.className = 'print-line'; line.style.top = top + '%'; effects.append(line);
      animate(line,[{opacity:0,transform:'scaleX(.15)'},{opacity:.8,transform:'scaleX(1)',offset:.55},{opacity:0,transform:'scaleX(.7)'}],{duration:110,delay,easing:'steps(2)'});
    }
    if (old) {
      const fragments = slices(old); old.style.opacity = '0';
      fragments.forEach(({band,offset}) => animate(band,[{transform:`translateX(${offset*.6}px)`},{transform:`translateX(${-offset*.3}px)`}],{duration:140,easing:'steps(2)'}));
    }
    later(() => {
      if (version !== generation) return;
      content.replaceChildren(next); next.style.opacity = '0';
      const fragments = slices(next);
      fragments.forEach(({band,offset}) => { band.querySelector('.music-card').style.opacity = '1'; animate(band,[{transform:`translateX(${-offset*.55}px)`},{transform:`translateX(${offset*.24}px)`,offset:.4},{transform:`translateX(${-offset*.1}px)`,offset:.65},{transform:'translateX(0)'}],{duration:250,easing:'steps(3)'}); });
    },260);
    later(() => {
      if (version !== generation) return;
      next.style.opacity = ''; commit(); effects.replaceChildren(); settled();
    },620);
  }
  function reconcile() {
    if (!enabled) { hardHide(); return; }
    if (transitioning) return;
    const view = desired();
    if (!view) { root.hidden = true; content.replaceChildren(); currentKey = ''; return; }
    if (currentKey === view.key) return;
    transition(view);
  }
  function receiveState(state) {
    if (typeof state?.enabled !== 'boolean') return;
    if (state.style) applyTheme(state.style);
    enabled = state.enabled;
    playback = state.playback ? {...state.playback, receivedAt:Date.now()} : null;
    if (!enabled) { playback = null; hardHide(); return; }
    reconcile();
  }
  function enqueue(payload) {
    if (!enabled || !payload?.track) return;
    const key = payload.requestId ? 'request:' + payload.requestId + ':' + payload.timestamp : 'request:' + (payload.timestamp || Date.now()) + ':' + payload.username;
    if (seen.has(key)) return; seen.add(key); if (seen.size > 100) seen.delete(seen.values().next().value);
    hint = false; cancelTimer(hintTimer); hintTimer = null; nextHintAt = Date.now()+60000;
    if (pending.length >= 30) pending.shift();
    pending.push({...payload,key,username:String(payload.username || 'Someone').replace(/^@+/, '')});
    if (!activeRequest) showNextRequest();
  }
  function showHint() {
    if (!enabled || !playback || activeRequest || pending.length || transitioning || hint) return;
    hint = true; reconcile();
    hintTimer = later(() => { hint = false; hintTimer = null; nextHintAt = Date.now()+60000; reconcile(); },6620);
  }
  function resize() {
    const scale = layout === 'compact' ? Math.min(1,innerWidth/570,innerHeight/125) : Math.min(1,(innerWidth-24)/570);
    root.style.transform = `scale(${scale})`;
    root.style.marginRight = layout === 'compact' || (layout === 'gaming' && innerWidth/innerHeight >= .75) ? '' : `${570*(scale-1)}px`;
  }
  addEventListener('resize',resize); resize();
  setInterval(() => {
    if (enabled && !hint && Date.now() >= nextHintAt) showHint();
    if (!playback || root.hidden) return;
    const progress = Math.min(1,(Number(playback.progressMs)+Date.now()-playback.receivedAt)/Math.max(1,Number(playback.durationMs)));
    content.querySelectorAll('.fill').forEach(fill => { fill.style.transform = `scaleX(${Math.max(0,progress)})`; });
  },250);
  if (preview) {
    // Isolated design preview: never connects to Spotify or live alerts.
    receiveState({enabled:true,style:params.get('theme')||'classic',playback:{id:'sample',name:'Somebody to Love',artists:['Queen'],albumArtUrl:'/assets/music-preview-cover.jpg',durationMs:240000,progressMs:86000}});
    later(() => enqueue({requestId:'preview',username:'Summer',track:{name:'Don’t Stop Me Now',artists:['Queen'],albumArtUrl:'/assets/music-preview-cover.jpg'}}),2000);
    later(showHint,8500);
  } else {
    const stateFeed = new EventSource('/overlay/music/events');
    stateFeed.addEventListener('music-state',event => { try { receiveState(JSON.parse(event.data)); } catch { /* Ignore malformed updates. */ } });
    stateFeed.onerror = () => { enabled = false; playback = null; hardHide(); };
    const requests = new EventSource('/overlay/events');
    requests.addEventListener('song-added',event => { try { enqueue(JSON.parse(event.data)); } catch { /* Ignore malformed requests. */ } });
    addEventListener('pagehide',() => { stateFeed.close(); requests.close(); hardHide(); });
  }
})();
