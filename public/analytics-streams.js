/* Stream explorer: dependency-free SVG, keyboard/touch inspection, no gap filling. */
(() => {
  const colors={twitch:'#b99aff',tiktok:'#4ecdc4',youtube:'#ff8294',total:'#edf4f7',previous:'#f4c95d',chat:'#67a8ff',interactions:'#4ecdc4'};
  const names={twitch:'Twitch',tiktok:'TikTok',youtube:'YouTube',total:'Combined',previous:'Comparison combined',chat:'Chat messages',interactions:'Tool interactions'};
  let sessions=[], selected='', comparison='', reportKey='';
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=n=>n==null?'Unavailable':new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(n);
  const label=s=>`${new Date(s.startedAt).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})} · ${s.title||s.platforms.join(', ')}${s.source==='inferred'?' · activity estimate':''}`;
  const legend=keys=>keys.map(k=>`<span style="--dot:${colors[k]}">${names[k]}</span>`).join('');
  function options(items,first=''){return first+items.map(s=>`<option value="${escape(s.id)}">${escape(label(s))}</option>`).join('');}
  function paths(series, maxTime, maxValue, step) {
    const x=t=>54+Math.min(1,t/maxTime)*880,y=v=>220-v/maxValue*185;
    let d='',last=null;
    for(const p of series){if(p.value==null){last=null;continue;}d+=`${last!==null&&p.elapsed-last<=step*1.1?'L':'M'}${x(p.elapsed).toFixed(1)},${y(p.value).toFixed(1)} `;last=p.elapsed;}
    return {d,x,y};
  }
  function chart(id,lines,maxTime,markers=[]) {
    const maxValue=Math.max(1,...lines.flatMap(l=>l.points.map(p=>p.value??0)))*1.1;
    const {x,y}=paths([],maxTime,maxValue,1);
    let svg=`<svg viewBox="0 0 960 260" role="img" aria-label="${id==='streamViewers'?'Viewer levels':'Recorded activity per minute'} by elapsed stream time"><title>${id==='streamViewers'?'Viewers throughout the stream':'Recorded activity throughout the stream'}</title>`;
    for(let i=0;i<=4;i++){const v=maxValue*i/4;svg+=`<line x1="54" x2="934" y1="${y(v)}" y2="${y(v)}" stroke="#34404d"/><text x="46" y="${y(v)+4}" text-anchor="end">${number(v)}</text>`;}
    for(let i=0;i<=4;i++){const t=maxTime*i/4;svg+=`<text x="${x(t)}" y="245" text-anchor="middle">${Math.round(t)} min</text>`;}
    for(const l of lines){const {d}=paths(l.points,maxTime,maxValue,l.step);svg+=`<path d="${d}" fill="none" stroke="${colors[l.key]}" stroke-width="${l.key==='total'?3:2}" ${l.key==='previous'?'stroke-dasharray="7 5"':''}/>`;
      for(const p of l.points.filter(p=>p.value!==null&&p.value!==undefined)) svg+=`<circle cx="${x(p.elapsed)}" cy="${y(p.value)}" r="2" fill="${colors[l.key]}"><title>${names[l.key]} · ${p.elapsed} min: ${number(p.value)}</title></circle>`;
    }
    for(const p of markers.filter(p=>Object.keys(p.events).length))svg+=`<circle cx="${x(p.elapsed)}" cy="16" r="4" fill="#f4c95d"><title>${p.elapsed} min: ${escape(Object.entries(p.events).map(([k,n])=>`${k} × ${n}`).join('; '))}</title></circle>`;
    $(id).innerHTML=svg+'</svg>';
  }
  function render() {
    const s=sessions.find(s=>s.id===selected);
    $('streamExplorerBody').hidden=!s;$('streamExplorerEmpty').hidden=!!s;
    if(!s)return;
    const d=s.detail,prev=sessions.find(s=>s.id===comparison),end=Math.max(1,s.durationMinutes,prev?.durationMinutes||0);
    $('streamContext').textContent=`${s.source==='platform'?'Recorded stream':'Activity estimate'} · ${s.status} · ${number(s.durationMinutes)} minutes. ${d.bucketMinutes}-minute chart buckets; gaps mean no measurement. Combined values require every listed platform in the same minute and are estimates, not deduplicated people.`;
    const metric=(title,value)=>`<div class="mini-stat"><span>${title}</span><strong>${value}</strong></div>`;
    $('streamDetailStats').innerHTML=metric('Aligned minute peak',number(d.peakConcurrentViewers))+metric('Combined minute coverage',number(d.coveragePercent)+'%')+metric('Returning participants',d.returningParticipants==null?'No baseline':`${number(d.returningParticipants)} / ${number(d.observedParticipants)}`)+metric('Follows / hour',number(d.followsPerHour))+metric('Subscriptions / hour',number(d.subscriptionsPerHour));
    $('streamCoverage').textContent=d.platformCoverage.length?d.platformCoverage.map(p=>`${names[p.platform]}: ${number(p.percent)}% of minute buckets measured`).join(' · '):'No platform viewer samples available.';
    const lines=d.platforms.map(key=>({key,step:d.bucketMinutes,points:d.points.map(p=>({elapsed:p.elapsed,value:p.viewers[key]??null}))}));
    lines.push({key:'total',step:d.bucketMinutes,points:d.points.map(p=>({elapsed:p.elapsed,value:p.total}))});
    if(prev)lines.push({key:'previous',step:prev.detail.bucketMinutes,points:prev.detail.points.map(p=>({elapsed:p.elapsed,value:p.total}))});
    $('streamViewerLegend').innerHTML=legend(lines.map(l=>l.key));
    const manual=(d.coaching?.segments||[]).map(m=>({elapsed:m.elapsed,events:{['Segment: '+m.label]:1}}));
    chart('streamViewers',lines,end,[...d.points,...manual]);
    chart('streamEngagement',['chat','interactions'].map(key=>({key,step:d.bucketMinutes,points:d.points.map(p=>({elapsed:p.elapsed,value:p[key]}))})),end);
    $('streamActivityLegend').innerHTML=legend(['chat','interactions']);
    $('streamMinute').max=Math.max(0,d.points.length-1);$('streamMinute').value=Math.min(Number($('streamMinute').value),Math.max(0,d.points.length-1));$('streamMinute').disabled=!d.points.length;
    inspect();
    $('streamSegments').innerHTML=d.segments.length?d.segments.map(g=>`<tr><td>${g.tool==='elimination_quiz'?'Quiz':'King of the Hill'} at ${number(g.elapsed)} min</td><td>${number(g.durationMinutes)} min</td><td>${number(g.coveragePercent)}${g.coveragePercent==null?'':'%'}</td><td>${number(g.averageViewers)}</td><td>${g.change==null?'Unavailable':`${g.change>0?'+':''}${number(g.change)}`}</td></tr>`).join(''):'<tr><td colspan="5">No games with both a recorded start and end in this selection.</td></tr>';
    $('streamEvents').innerHTML=d.points.filter(p=>Object.keys(p.events).length).map(p=>`<tr><td>${number(p.elapsed)} min</td><td>${escape(Object.entries(p.events).map(([k,n])=>`${k} × ${n}`).join(' · '))}</td><td>${number(p.total)}</td></tr>`).join('')||'<tr><td colspan="3">No markers recorded.</td></tr>';
  }
  function inspect(){
    const d=sessions.find(s=>s.id===selected)?.detail,p=d?.points[Number($('streamMinute').value)];
    $('streamPoint').textContent=p?`${p.elapsed} min · ${new Date(p.timestamp).toLocaleTimeString()} · ${d.platforms.map(k=>`${names[k]} ${number(p.viewers[k])}`).join(' · ')} · Combined ${number(p.total)} · Chat ${number(p.chat)}/min · Interactions ${number(p.interactions)}/min${Object.keys(p.events).length?' · '+Object.entries(p.events).map(([k,n])=>`${k} × ${n}`).join(', '):''}`:'No recorded samples or events for this stream.';
  }
  window.renderStreamExplorer=report=>{
    const key=JSON.stringify(report.filters);const reset=key!==reportKey;reportKey=key;
    sessions=report.sessions.filter(s=>s.detail);
    if(reset||!sessions.some(s=>s.id===selected)){selected=sessions[0]?.id||'';comparison=sessions.find(s=>s.id!==selected&&s.source==='platform')?.id||'';}
    if(!sessions.some(s=>s.id===comparison)||comparison===selected)comparison='';
    $('streamSelect').innerHTML=options(sessions);$('streamSelect').value=selected;
    $('streamCompare').innerHTML=options(sessions.filter(s=>s.id!==selected),'<option value="">No comparison</option>');$('streamCompare').value=comparison;
    render();
  };
  window.focusStreamMoment=(id,timestamp)=>{
    const s=sessions.find(s=>s.id===id);if(!s)return;selected=id;comparison='';$('streamSelect').value=id;
    $('streamCompare').innerHTML=options(sessions.filter(s=>s.id!==id),'<option value="">No comparison</option>');render();
    const time=Date.parse(timestamp),points=s.detail.points;let nearest=0;
    points.forEach((p,i)=>{if(Math.abs(Date.parse(p.timestamp)-time)<Math.abs(Date.parse(points[nearest].timestamp)-time))nearest=i;});
    $('streamMinute').value=nearest;inspect();$('streamPoint').textContent='Requested moment: '+new Date(timestamp).toLocaleString()+'. Nearest recorded bucket: '+$('streamPoint').textContent;
    $('streamSelect').scrollIntoView({block:'start'});$('streamMinute').focus({preventScroll:true});
  };
  $('streamSelect').addEventListener('change',e=>{
    selected=e.target.value;const index=sessions.findIndex(s=>s.id===selected);comparison=sessions.slice(index+1).find(s=>s.source==='platform')?.id||'';
    $('streamCompare').innerHTML=options(sessions.filter(s=>s.id!==selected),'<option value="">No comparison</option>');$('streamCompare').value=comparison;$('streamMinute').value=0;render();
  });
  $('streamCompare').addEventListener('change',e=>{comparison=e.target.value;render();});
  $('streamMinute').addEventListener('input',inspect);
})();
