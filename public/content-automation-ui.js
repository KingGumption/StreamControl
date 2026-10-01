(() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt=value=>value==null?'Unavailable':new Intl.NumberFormat().format(value);
  const date=value=>value?new Date(value).toLocaleString():'Never';
  const status=document.getElementById('automationStatus');
  const cards=document.getElementById('opportunityCards');
  const search=document.getElementById('groupSearch');
  const count=document.getElementById('groupCount');
  const more=document.getElementById('moreGroups');
  let groups=[],visible=60;

  function renderAnalysis(analysis){
    if(!analysis)return '';
    const facts=analysis.measuredFacts?.map(item=>`<li>${esc(item)}</li>`).join('')||'';
    const hypotheses=analysis.hypotheses?.map(item=>`<li>${esc(item)}</li>`).join('')||'';
    const actions=analysis.actions?.map(item=>`<li><strong>${esc(item.field)}:</strong> ${esc(item.change)} <span>${esc(item.reason)}</span></li>`).join('')||'';
    return `<div class="group-analysis"><p>${esc(analysis.summary)}</p><h4>Measured facts</h4><ul>${facts}</ul><h4>Possible explanations</h4><ul>${hypotheses}</ul><h4>Changes to test</h4><ul>${actions}</ul><small>Generated ${esc(date(analysis.generatedAt))}</small></div>`;
  }
  function render(){
    const query=search.value.trim().toLowerCase();
    const matches=groups.filter(group=>group.posts.some(post=>[post.metadata.title,post.metadata.description,post.platform].join(' ').toLowerCase().includes(query)));
    count.textContent=`${matches.length} video ${matches.length===1?'group':'groups'} · matches use posts published within 20 minutes, one per platform`;
    cards.innerHTML=matches.slice(0,visible).map(group=>{
      const newest=group.posts.at(-1);
      const title=newest?.metadata.title||'Untitled video';
      const versions=group.posts.map(post=>{
        const cover=post.metadata.coverUrl?`<img class="version-cover" src="${esc(post.metadata.coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'';
        return `<li class="group-version">${cover}<div><span class="tag">${esc(post.platform)} · ${esc(post.metadata.format)}</span><a href="${esc(post.url)}" target="_blank" rel="noopener noreferrer">${esc(post.metadata.title||'Untitled video')}</a><small>Published ${esc(date(post.publishedAt))} · ${fmt(post.metrics.views)} views · ${fmt(post.metrics.likes)} likes · ${fmt(post.metrics.shares)} shares</small></div>${group.posts.length>1?`<button type="button" data-remove-group="${esc(group.id)}" data-platform="${esc(post.platform)}" data-url="${esc(post.url)}" aria-label="Remove ${esc(post.platform)} version from this group">Remove from group</button>`:''}</li>`;
      }).join('');
      const ready=Boolean(group.analysis&&!group.stale);
      return `<article class="panel group-card"><div class="group-card-head"><div><span class="tag">${group.posts.length} ${group.posts.length===1?'version':'versions'} · ${group.posts.map(post=>esc(post.platform)).join(' · ')}</span><h3>${esc(title)}</h3></div>${ready?'<span class="group-ready">Analysis current</span>':`<button class="primary" type="button" data-analyze-group="${esc(group.id)}">Analyze group · 1 AI request</button>`}</div><p>${group.posts.length>1?'Grouped by publishing time. Remove any version that is a different video.':'No matching cross-platform version found yet.'}</p><ul class="group-versions">${versions}</ul>${group.stale?'<p class="group-stale">This analysis is older than the group or its latest metrics. Analyze again to update it.</p>':''}${renderAnalysis(group.analysis)}</article>`;
    }).join('')||'<p>No matching video groups yet. Connected accounts will populate these during metric sync.</p>';
    more.hidden=matches.length<=visible;
  }
  async function load(){
    try{
      const response=await fetch('/admin/content-coach/analysis',{cache:'no-store'});
      if(!response.ok)throw Error('Could not load Content Coach groups.');
      const data=await response.json(),job=data.status.job,ai=data.status.ai;
      const connections=Object.entries(data.status.platforms).map(([name,value])=>`${name}: ${value.connected?'connected':value.configured?'waiting for account consent':'developer app credentials needed'}`);
      status.innerHTML=`<p>Last metric sync: ${esc(date(job?.last_finished_at))} · Next due: ${esc(date(job?.next_at))}</p><p>${connections.map(esc).join(' · ')}</p><p>AI runs only when you select Analyze group. Conservative allowance £${esc(ai.reserved_gbp.toFixed(2))} / £${esc(ai.budgetGbp.toFixed(2))} this month · ${fmt(ai.requests)} requests. This is an app guard, not your provider invoice.</p>${job?.last_error?`<p class="error">${esc(job.last_error)}</p>`:''}${job?.detail?`<details><summary>Provider details</summary><pre>${esc(job.detail)}</pre></details>`:''}`;
      groups=data.groups||[];render();
    }catch(error){status.textContent=error.message;cards.textContent='';}
  }
  search.addEventListener('input',()=>{visible=60;render();});
  more.addEventListener('click',()=>{visible+=60;render();});
  document.addEventListener('click',async event=>{
    const analyze=event.target.closest('[data-analyze-group]');
    const remove=event.target.closest('[data-remove-group]');
    const button=analyze||remove;
    if(!button)return;
    button.disabled=true;
    try{
      const id=button.dataset.analyzeGroup||button.dataset.removeGroup;
      const url=`/admin/content-coach/analysis/group/${encodeURIComponent(id)}${remove?'/remove':''}`;
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
        body:remove?JSON.stringify({platform:button.dataset.platform,url:button.dataset.url}):'{}'});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Could not update the group.');
      await load();
    }catch(error){status.textContent=error.message;button.disabled=false;}
  });
  document.querySelector('[data-page="opportunities"]').addEventListener('click',load);
  load();
})();
