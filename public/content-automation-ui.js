(() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt=value=>value==null?'Unavailable':new Intl.NumberFormat().format(value);
  const date=value=>value?new Date(value).toLocaleString():'Never';
  const status=document.getElementById('automationStatus');
  const cards=document.getElementById('opportunityCards');
  const search=document.getElementById('groupSearch');
  const count=document.getElementById('groupCount');
  const more=document.getElementById('moreGroups');
  const trialCards=document.getElementById('adviceTrials');
  let groups=[],trials=[],visible=60;

  function renderAnalysis(analysis,group){
    if(!analysis)return '';
    const facts=analysis.measuredFacts?.map(item=>`<li>${esc(item)}</li>`).join('')||'';
    const hypotheses=analysis.hypotheses?.map(item=>`<li>${esc(item)}</li>`).join('')||'';
    const actions=analysis.actions?.map((item,index)=>{
      const tracked=trials.some(trial=>trial.sourceGroupId===group.id&&trial.actionIndex===index&&trial.analysisFingerprint===group.analysisFingerprint);
      return `<li><strong>${esc(item.field)}:</strong> ${esc(item.change)} <span>${esc(item.reason)}</span>${tracked?' <small>Tracking</small>':` <button type="button" data-track-group="${esc(group.id)}" data-action-index="${index}">Track this suggestion</button>`}</li>`;
    }).join('')||'';
    return `<div class="group-analysis"><p>${esc(analysis.summary)}</p><h4>Measured facts</h4><ul>${facts}</ul><h4>Possible explanations</h4><ul>${hypotheses}</ul><h4>Changes to test</h4><ul>${actions}</ul><small>Generated ${esc(date(analysis.generatedAt))}${analysis.visualSamples?` · ${esc(analysis.visualSamples)} original-video frames reviewed`:''}${analysis.transcriptSupplied?' · transcript supplied':''}</small></div>`;
  }
  function renderTrials(){
    trialCards.innerHTML=trials.length?trials.map(trial=>{
      const source=groups.find(group=>group.id===trial.sourceGroupId);
      const candidates=groups.filter(group=>source&&group.id!==source.id&&group.posts[0].metadata.format===source.posts[0].metadata.format&&
        Date.parse(group.posts.at(-1).publishedAt)>Date.parse(source.posts.at(-1).publishedAt));
      const options=candidates.map(group=>`<option value="${esc(group.id)}" ${group.id===trial.targetGroupId?'selected':''}>${esc(group.posts.at(-1).metadata.title||'Untitled video')} · ${esc(date(group.posts.at(-1).publishedAt))}</option>`).join('');
      const results=trial.outcomes?.map(item=>`<li>${esc(item.platform)}: ${fmt(item.views)} views · ${item.baseline.median==null?`No age-matched baseline (${fmt(item.baseline.sample)} earlier measurements)`:`${(item.baseline.multiple||0).toFixed(2)}× own earlier-post median (${fmt(item.baseline.sample)} posts)`}</li>`).join('')||'';
      return `<div class="trial-item"><span class="tag">${esc(trial.state)}</span><strong>${esc(trial.field)}: ${esc(trial.change)}</strong><small>Suggested for ${esc(trial.sourceTitle)}</small>${trial.state==='planned'?`<label>Video where you actually used it<select data-trial-target="${esc(trial.id)}"><option value="">Choose a later video</option>${options}</select></label><div class="actions"><button type="button" data-apply-trial="${esc(trial.id)}">Mark applied & track results</button><button type="button" data-dismiss-trial="${esc(trial.id)}">Dismiss</button></div>`:trial.state==='applied'?`<p>Applied to ${esc(trial.targetTitle||'later video')}. Results update as metrics sync.</p><ul>${results}</ul>`:'<p>Dismissed.</p>'}</div>`;
    }).join(''):'<p>No suggestions are being tracked yet. Analyze a group, then choose a change to test.</p>';
  }
  function renderResearch(group){
    const research=group.research;
    const examples=research?.examples||[];
    return `<div class="group-research"><h4>Public YouTube references</h4><p>Source links and raw public views only. These are not matched benchmarks; private retention and reach are unknown. AI comparison of competitors remains gated pending the YouTube analytics-use-case audit.</p><button type="button" data-research-group="${esc(group.id)}">${research?'Refresh references':'Find public examples'}</button>${research?`<small> Checked ${esc(date(research.checkedAt))}</small>`:''}${examples.length?`<ul>${examples.map(item=>`<li><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a> · ${esc(item.creator)} · ${fmt(item.publicViews)} public views · published ${esc(date(item.publishedAt))}</li>`).join('')}</ul>`:research?'<p>No public matches found for this title.</p>':''}</div>`;
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
      return `<article class="panel group-card"><div class="group-card-head"><div><span class="tag">${group.posts.length} ${group.posts.length===1?'version':'versions'} · ${group.posts.map(post=>esc(post.platform)).join(' · ')}</span><h3>${esc(title)}</h3></div>${ready?'<span class="group-ready">Analysis current</span>':`<button class="primary" type="button" data-analyze-group="${esc(group.id)}">Analyze group · 1 AI request</button>`}</div><p>${group.posts.length>1?'Grouped by publishing time. Remove any version that is a different video.':'No matching cross-platform version found yet.'}</p><ul class="group-versions">${versions}</ul><details class="video-evidence"><summary>Optional: analyze the original video</summary><p>Select your edited original. Content Coach samples up to eight still frames in your browser, including the opening seconds. The file itself is not uploaded or stored. Add a transcript if you want speech assessed; frames alone cannot reveal audio, exact pacing or every scene. This is a manual AI request using a higher £0.20 allowance reservation.</p><label>Original video file<input type="file" accept="video/*" data-video-file></label><label>Optional spoken transcript<textarea data-video-transcript maxlength="6000" placeholder="Paste captions or a transcript here"></textarea></label><button type="button" data-analyze-video="${esc(group.id)}">Analyze with video frames · 1 AI request</button></details>${group.stale?'<p class="group-stale">This analysis is older than the group or its latest metrics. Analyze again to update it.</p>':''}${renderAnalysis(group.analysis,group)}${renderResearch(group)}</article>`;
    }).join('')||'<p>No matching video groups yet. Connected accounts will populate these during metric sync.</p>';
    more.hidden=matches.length<=visible;
    renderTrials();
  }
  async function load(){
    try{
      const response=await fetch('/admin/content-coach/analysis',{cache:'no-store'});
      if(!response.ok)throw Error('Could not load Content Coach groups.');
      const data=await response.json(),job=data.status.job,ai=data.status.ai;
      const connections=Object.entries(data.status.platforms).map(([name,value])=>`${name}: ${value.connected?'connected':value.configured?'waiting for account consent':'developer app credentials needed'}`);
      status.innerHTML=`<p>Last metric sync: ${esc(date(job?.last_finished_at))} · Next due: ${esc(date(job?.next_at))}</p><p>${connections.map(esc).join(' · ')}</p><p>AI runs only when you select Analyze group. Conservative allowance £${esc(ai.reserved_gbp.toFixed(2))} / £${esc(ai.budgetGbp.toFixed(2))} this month · ${fmt(ai.requests)} requests. This is an app guard, not your provider invoice.</p>${job?.last_error?`<p class="error">${esc(job.last_error)}</p>`:''}${job?.detail?`<details><summary>Provider details</summary><pre>${esc(job.detail)}</pre></details>`:''}`;
      groups=data.groups||[];trials=data.trials||[];render();
    }catch(error){status.textContent=error.message;cards.textContent='';}
  }
  async function sampleVideo(file,transcript){
    if(!file||!file.type.startsWith('video/'))throw Error('Choose an original video file.');
    const video=document.createElement('video');
    const url=URL.createObjectURL(file);
    video.preload='auto';video.muted=true;video.playsInline=true;video.src=url;
    try{
      await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('This browser could not read the video.'));});
      const duration=video.duration;
      if(!Number.isFinite(duration)||duration<=0||duration>21600)throw Error('Video duration must be between 1 second and 6 hours.');
      const seconds=[0,Math.min(1,duration*.15),Math.min(3,duration*.3),duration*.25,duration*.45,duration*.65,duration*.82,duration*.97]
        .map(value=>Math.max(0,Math.min(value,duration-.05))).filter((value,index,array)=>index===0||value-array[index-1]>.15);
      const canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;
      const context=canvas.getContext('2d');
      const frames=[];
      for(const second of seconds){
        if(Math.abs(video.currentTime-second)>.01){
          video.currentTime=second;
          await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=()=>reject(Error('Could not sample the video.'));});
        }else if(video.readyState<2)await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Could not load a video frame.'));});
        context.fillStyle='#000';context.fillRect(0,0,480,270);
        const scale=Math.min(480/video.videoWidth,270/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale;
        context.drawImage(video,(480-w)/2,(270-h)/2,w,h);
        frames.push({second:Number(second.toFixed(2)),image:canvas.toDataURL('image/jpeg',.48)});
      }
      return {durationSeconds:duration,transcript:transcript.slice(0,6000),frames};
    }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  }
  search.addEventListener('input',()=>{visible=60;render();});
  more.addEventListener('click',()=>{visible+=60;render();});
  document.addEventListener('click',async event=>{
    const analyze=event.target.closest('[data-analyze-group]');
    const videoAnalyze=event.target.closest('[data-analyze-video]');
    const remove=event.target.closest('[data-remove-group]');
    const track=event.target.closest('[data-track-group]');
    const apply=event.target.closest('[data-apply-trial]');
    const dismiss=event.target.closest('[data-dismiss-trial]');
    const research=event.target.closest('[data-research-group]');
    const button=analyze||videoAnalyze||remove||track||apply||dismiss||research;
    if(!button)return;
    button.disabled=true;
    try{
      const id=button.dataset.analyzeGroup||button.dataset.analyzeVideo||button.dataset.removeGroup||button.dataset.trackGroup||button.dataset.researchGroup;
      const trialId=button.dataset.applyTrial||button.dataset.dismissTrial;
      const url=trialId?`/admin/content-coach/analysis/trial/${encodeURIComponent(trialId)}`:
        `/admin/content-coach/analysis/group/${encodeURIComponent(id)}${remove?'/remove':track?'/track':research?'/research':''}`;
      const targetGroupId=apply?document.querySelector(`[data-trial-target="${CSS.escape(trialId)}"]`)?.value:null;
      let videoEvidence;
      if(videoAnalyze){const panel=button.closest('.video-evidence');videoEvidence=await sampleVideo(panel.querySelector('[data-video-file]').files[0],panel.querySelector('[data-video-transcript]').value);}
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(remove?{platform:button.dataset.platform,url:button.dataset.url}:track?{actionIndex:Number(button.dataset.actionIndex)}:
          trialId?{targetGroupId,state:apply?'applied':'dismissed'}:videoAnalyze?{videoEvidence}:{})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Could not update the group.');
      await load();
    }catch(error){status.textContent=error.message;button.disabled=false;}
  });
  document.querySelector('[data-page="opportunities"]').addEventListener('click',load);
  load();
})();
