(() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt=value=>value==null?'Unavailable':new Intl.NumberFormat().format(value);
  const date=value=>value?new Date(value).toLocaleString():'Never';
  const status=document.getElementById('automationStatus');
  const cards=document.getElementById('opportunityCards');
  async function load(){
    try{
      const response=await fetch('/admin/content-coach/analysis',{cache:'no-store'});
      if(!response.ok)throw Error('Could not load automated analysis.');
      const data=await response.json(),job=data.status.job,ai=data.status.ai;
      const connections=Object.entries(data.status.platforms).map(([name,value])=>`${name}: ${value.connected?'connected':value.configured?'waiting for account consent':'developer app credentials needed'}`);
      status.innerHTML=`<p>Last completed: ${esc(date(job?.last_finished_at))} · Next due: ${esc(date(job?.next_at))}</p><p>${connections.map(esc).join(' · ')}</p><p>AI: ${ai.configured?'configured':'OPENAI_API_KEY needed'} · conservative allowance £${esc(ai.reserved_gbp.toFixed(2))} / £${esc(ai.budgetGbp.toFixed(2))} this month · ${fmt(ai.requests)} requests. This is an app guard, not your provider invoice.</p>${job?.last_error?`<p class="error">${esc(job.last_error)}</p>`:''}${job?.detail?`<details><summary>Provider details</summary><pre>${esc(job.detail)}</pre></details>`:''}`;
      const posts=data.posts.filter(post=>post.adviceState!=='dismissed');
      cards.innerHTML=posts.length?posts.map(post=>{
        const m=post.metadata,a=post.analysis,base=post.baseline;
        const image=m.coverUrl?`<img class="post-cover" src="${esc(m.coverUrl)}" alt="Cover for ${esc(m.title)}" loading="lazy" referrerpolicy="no-referrer">`:'';
        const facts=a?.measuredFacts?.map(item=>`<li>${esc(item)}</li>`).join('')||'';
        const hypotheses=a?.hypotheses?.map(item=>`<li>${esc(item)}</li>`).join('')||'';
        const actions=a?.actions?.map(item=>`<li><strong>${esc(item.field)}:</strong> ${esc(item.change)} <span>${esc(item.reason)}</span></li>`).join('')||'';
        const examples=post.examples?.length?`<details><summary>Related public YouTube examples</summary><p>Official public results, shown for reference. Their private metrics are unknown; these are not matched benchmarks.</p><ul>${post.examples.map(e=>`<li><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a> · ${esc(e.creator)} · ${fmt(e.publicViews)} public views · checked ${esc(date(e.checkedAt))}</li>`).join('')}</ul></details>`:'';
        return `<article class="panel opportunity"><div>${image}<span class="tag">${esc(post.platform)} · ${esc(m.format)} · ${esc(post.adviceState)}</span><h3><a href="${esc(post.url)}" target="_blank" rel="noopener noreferrer">${esc(m.title)}</a></h3><p>Published ${esc(date(post.publishedAt))} · ${fmt(post.metrics.views)} views · ${fmt(post.metrics.likes)} likes · ${fmt(post.metrics.shares)} shares</p><p>Own baseline: ${base.median==null?esc(base.label):`${fmt(base.median)} median views from ${fmt(base.sample)} earlier posts at a similar age`}. Historical posts may have lifetime-only snapshots.</p>${a?`<p>${esc(a.summary)}</p><h4>Measured facts</h4><ul>${facts}</ul><h4>Possible explanations</h4><ul>${hypotheses}</ul><h4>Changes to test</h4><ul>${actions}</ul><small>Generated ${esc(date(a.generatedAt))}</small>`:'<p>Awaiting automated analysis. Metadata and metrics remain available even if the AI key or monthly allowance is unavailable.</p>'}${examples}<div class="actions"><button data-advice="tried" data-platform="${esc(post.platform)}" data-url="${esc(post.url)}">Mark tried</button><button data-advice="dismissed" data-platform="${esc(post.platform)}" data-url="${esc(post.url)}">Dismiss</button></div></div></article>`;
      }).join(''):'<p>No imported video posts yet. Connect accounts in Data & imports; the daily job will populate this queue.</p>';
    }catch(error){status.textContent=error.message;cards.textContent='';}
  }
  document.getElementById('runContentAnalysis').onclick=async event=>{
    event.currentTarget.disabled=true;status.textContent='Running due sync…';
    try{const result=await fetch('/admin/content-coach/analysis/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!result.ok)throw Error('Could not start sync.');await load();}
    catch(error){status.textContent=error.message;}
    finally{event.currentTarget.disabled=false;}
  };
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-advice]');if(!button)return;
    button.disabled=true;
    try{const response=await fetch('/admin/content-coach/analysis/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:button.dataset.platform,url:button.dataset.url,state:button.dataset.advice})});if(!response.ok)throw Error('Could not save advice state.');await load();}
    catch(error){status.textContent=error.message;button.disabled=false;}
  });
  document.querySelector('[data-page="opportunities"]').addEventListener('click',load);
  load();
})();
