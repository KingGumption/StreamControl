(() => {
 const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=v=>v===null||v===undefined?'Unavailable':new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(v);
 const delta=v=>v==null?'Unavailable':`${v>0?'+':''}${n(v)}`;
 const date=s=>new Date(s).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});
 const metrics={medianOpeningChange:'Opening audience change',medianFollowsPerHour:'Follows / hour',medianReturningPercent:'Returning participants %'};
 let report=null, notes=null, notesPromise=null, optionKey='',busy=false,formatDirty=false;
 const status=message=>{$('growthStatus').textContent=message;};
 const row=cells=>'<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
 const empty=(columns,message)=>`<tr><td colspan="${columns}">${esc(message)}</td></tr>`;
 async function getNotes(){if(notes)return notes;if(!notesPromise)notesPromise=fetch('/admin/analytics/growth-notes',{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not load growth notes.');return notes=data;}).finally(()=>{notesPromise=null;});return notesPromise;}
 async function save(action){
  if(busy)return false;busy=true;
  try{await getNotes();status('Saving…');const r=await fetch('/admin/analytics/growth-notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...action,revision:notes.revision})});const result=await r.json();if(!r.ok){if(r.status===409){notes=null;await getNotes();}throw new Error(result.error||'Could not save.');}notes=result;status('Saved.');await loadAnalytics();return true;}
  catch(e){status(e.message);return false;}finally{busy=false;}
 }
 function fillOptions(){
  const sessions=report.sessions.filter(s=>s.source==='platform'&&!s.estimatedEnd&&s.detail.growth.fullStream),key=sessions.map(s=>s.growthId||s.id).join('\n');
  if(key===optionKey)return;optionKey=key;
  for(const id of ['growthFormatStream','growthBaseline','growthTrial']){
   const selected=[...$(id).selectedOptions].map(o=>o.value);
   $(id).innerHTML=sessions.map(s=>`<option value="${esc(s.growthId||s.id)}">${esc(date(s.startedAt)+' · '+(s.title||s.platforms.join(', ')))}</option>`).join('');
   if(selected.length)for(const option of $(id).options)option.selected=selected.includes(option.value);
  }
 }
 function tableGroups(id,groups){$(id).innerHTML=groups.length?groups.map(g=>row([esc(g.label)+(g.streams<3?' <small>(small sample)</small>':''),n(g.streams),n(g.measured),delta(g.medianOpeningChange),n(g.medianFollowsPerHour),n(g.medianReturningPercent)])).join(''):empty(6,'No full recorded streams in this selection.');}
 window.renderGrowth=r=>{
  report=r;const g=r.growth;if(!g)return;
  $('growthCohorts').innerHTML=g.cohorts.map(c=>`<article><h3>${c.days}-day return rate</h3><strong>${c.rate==null?'Not ready':n(c.rate)+'%'}</strong><p>${n(c.returned)} returned / ${n(c.matured)} completed observation windows · ${n(c.pending)} pending</p></article>`).join('');
  $('growthOpenings').innerHTML=r.sessions.length?r.sessions.map(s=>{const o=s.detail.growth.opening;return row([esc(date(s.startedAt)+' · '+(s.title||s.platforms.join(', '))),n(o.first5),n(o.last5),delta(o.change),n(o.chatters)]);}).join(''):empty(5,'No streams in this selection.');
  const raids=r.sessions.flatMap(s=>s.detail.growth.raids.map(raid=>({...raid,title:s.title})));
  $('growthRaids').innerHTML=raids.length?raids.map(a=>row([esc(date(a.timestamp)+' · '+a.title),esc(a.platform),n(a.baseline),n(a.after10),delta(a.lift10),n(a.after30),delta(a.lift30),a.overlapping?'Another raid overlaps this window':'No overlapping raid recorded'])).join(''):empty(8,'No raids recorded in this selection.');
  tableGroups('growthSchedule',g.schedule);tableGroups('growthFormats',g.formats);fillOptions();
  const sources=new Map();for(const d of g.discovery){const k=`${d.platform} · ${d.source} · ${d.provenance}`;sources.set(k,(sources.get(k)||0)+d.visits);}
  const max=Math.max(1,...sources.values());$('growthDiscoveryBars').innerHTML=[...sources].sort((a,b)=>b[1]-a[1]).map(([label,count])=>`<div><span>${esc(label)} — ${n(count)}</span><div class="growth-bar" style="width:${count/max*100}%"></div></div>`).join('')||'<p>No discovery records imported for this selection.</p>';
  $('growthDiscovery').innerHTML=g.discovery.length?[...g.discovery].sort((a,b)=>b.date.localeCompare(a.date)).map(d=>row([esc(d.date),esc(d.platform),esc(d.source)+(d.url?`<br><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Open clip / link</a>`:''),n(d.visits),esc(d.provenance),`<button type="button" class="button" data-remove-discovery="${esc(d.id)}">Remove</button>`])).join(''):empty(6,'Add daily records or import CSV above.');
  $('growthExperiments').innerHTML=g.experiments.length?g.experiments.map(e=>{const a=e.baselineSummary[e.metric],b=e.trialSummary[e.metric];return row([`<strong>${esc(e.hypothesis)}</strong><br>${esc(e.notes)}`,esc(metrics[e.metric]),n(a),n(b),a==null||b==null?'Unavailable':delta(Math.round((b-a)*10)/10),`${e.baselineSummary.samples[e.metric]} measured baseline / ${e.trialSummary.samples[e.metric]} measured trial${Math.min(e.baselineSummary.samples[e.metric],e.trialSummary.samples[e.metric])<3?' · small sample':''}${e.missingStreams?' · '+e.missingStreams+' outside selection or incomplete':''}`,`<button type="button" class="button" data-edit-experiment="${esc(e.id)}">Edit</button> <button type="button" class="button" data-remove-experiment="${esc(e.id)}">Remove</button>`]);}).join(''):empty(7,'No experiments saved yet.');
  getNotes().then(()=>{if(!formatDirty)$('growthFormatLabel').value=notes.formats[$('growthFormatStream').value]||'';}).catch(e=>status(e.message));
 };
 $('growthFormatLabel').addEventListener('input',()=>{formatDirty=true;});
 $('growthFormatStream').addEventListener('change',async()=>{formatDirty=false;try{await getNotes();$('growthFormatLabel').value=notes.formats[$('growthFormatStream').value]||'';}catch(e){status(e.message);}});
 $('growthFormatForm').addEventListener('submit',async e=>{e.preventDefault();await save({type:'format',sessionId:$('growthFormatStream').value,value:$('growthFormatLabel').value});});
 $('growthDiscoveryDate').value=new Date().toISOString().slice(0,10);
 $('growthDiscoveryForm').addEventListener('submit',async e=>{e.preventDefault();await save({type:'discovery',rows:[{date:$('growthDiscoveryDate').value,platform:$('growthDiscoveryPlatform').value,source:$('growthDiscoverySource').value,visits:$('growthDiscoveryVisits').value,url:$('growthDiscoveryUrl').value,provenance:$('growthDiscoveryEvidence').value}]});});
 function resetExperiment(){$('growthExperimentForm').reset();$('growthExperimentId').value='';}
 $('growthExperimentReset').addEventListener('click',resetExperiment);
 $('growthExperimentForm').addEventListener('submit',async e=>{e.preventDefault();const chosen=id=>[...$(id).selectedOptions].map(o=>o.value);const saved=await save({type:'experiment',id:$('growthExperimentId').value||undefined,hypothesis:$('growthHypothesis').value,metric:$('growthMetric').value,notes:$('growthExperimentNotes').value,baseline:chosen('growthBaseline'),trial:chosen('growthTrial')});if(saved)$('growthExperimentId').value=notes.experiments.at(-1).id;});
 $('growthExperiments').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit-experiment]'),remove=e.target.closest('[data-remove-experiment]');
  if(remove){await save({type:'remove',collection:'experiments',id:remove.dataset.removeExperiment});return;}
  if(edit){try{await getNotes();const item=notes.experiments.find(x=>x.id===edit.dataset.editExperiment);if(!item)return;const available=new Set([...$('growthBaseline').options].map(o=>o.value));if([...item.baseline,...item.trial].some(id=>!available.has(id))){status('Expand the date range to include every experiment stream before editing.');return;}$('growthExperimentId').value=item.id;$('growthHypothesis').value=item.hypothesis;$('growthMetric').value=item.metric;$('growthExperimentNotes').value=item.notes;for(const [id,values] of [['growthBaseline',item.baseline],['growthTrial',item.trial]])for(const option of $(id).options)option.selected=values.includes(option.value);$('growthHypothesis').focus();}catch(err){status(err.message);}}
 });
 $('growthDiscovery').addEventListener('click',async e=>{const button=e.target.closest('[data-remove-discovery]');if(button)await save({type:'remove',collection:'discovery',id:button.dataset.removeDiscovery});});
 $('growthCsvTemplate').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob(['date,platform,source,visits,url,provenance\n'],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='stream-discovery-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 $('growthCsvImport').addEventListener('click',async()=>{try{const file=$('growthCsvFile').files[0];if(!file)throw new Error('Choose a CSV file first.');if(file.size>80000)throw new Error('CSV must be smaller than 80 KB.');await save({type:'discovery',rows:window.StreamGrowthCSV.parse(await file.text())});}catch(e){status(e.message);}});
})();
