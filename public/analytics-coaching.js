(() => {
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const empty=(columns,message)=>`<tr><td colspan="${columns}">${esc(message)}</td></tr>`,pct=v=>v==null?'Unavailable':n(v)+'%';
 const n=v=>v==null?'Unavailable':new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(v);
 const date=v=>new Date(v).toLocaleString(),row=cells=>'<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
 let report=null,busy=false;
 const selected=()=>report?.sessions.find(s=>s.id===$('coachStream').value);
 const status=s=>{$('coachStatus').textContent=s;};
 const jump=(s,t,label)=>`<button class="button" type="button" data-coach-jump="${esc(t)}" data-session="${esc(s.id)}">${esc(label)}</button>`;
 const remove=(collection,id)=>`<button class="button" type="button" data-coach-remove="${esc(id)}" data-collection="${collection}">Remove</button>`;
 const elapsed=(s,t)=>Math.max(0,(Date.parse(t)-Date.parse(s.startedAt))/60000);
 function options(id,items){const old=$(id).value;$(id).innerHTML=items.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');if(items.some(([v])=>v===old))$(id).value=old;}
 async function save(action){
  if(busy)return false;busy=true;
  try{
   status('Saving…');const response=await fetch('/admin/analytics/growth-notes',{cache:'no-store'});const notes=await response.json();if(!response.ok)throw new Error(notes.error||'Cannot read notes.');
   const r=await fetch('/admin/analytics/growth-notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...action,revision:notes.revision})});const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not save.');
   window.invalidateGrowthNotes?.();await loadAnalytics();status('Saved.');return true;
  }catch(e){status(e.message);return false;}finally{busy=false;}
 }
 function renderStream(){
  const s=selected(),c=s?.detail.coaching;$('coachBody').hidden=!c;$('coachEmpty').hidden=!!c;if(!c)return;
  $('coachReportTitle').textContent=c.complete?'Post-stream coaching report':'Provisional coaching report — end not confirmed';
  $('coachFindings').innerHTML=c.findings.length?c.findings.map(f=>`<li>${esc(f.text)} ${jump(s,f.timestamp,'Inspect moment')}</li>`).join(''):'<li>More recorded activity is needed before highlighting moments.</li>';
  $('coachExperiment').textContent='Next experiment: '+c.experiment;
  const b=c.participation;
  $('coachBreadth').textContent=`${n(b.participants)} participating platform accounts · ${n(b.actions)} recorded chat / tool actions · top five accounts: ${b.topFiveShare==null?'Unavailable':n(b.topFiveShare)+'%'} of actions · ${n(b.singleActionParticipants)} accounts acted once. Accounts on different platforms remain separate; silent viewers are unknown.`;
  $('coachSegments').innerHTML=c.segments.map(m=>row([esc(m.label),jump(s,m.timestamp,n(m.elapsed)+' min'),n(m.minutes)+(m.continues?' · through observed end':''),n(m.average),n(m.change),n(m.participants),pct(m.coverage),`<button class="button" type="button" data-segment-edit="${esc(m.id)}">Edit</button> `+remove('segments',m.id)])).join('')||empty(8,'No content markers yet.');
  $('coachClips').innerHTML=c.candidates.map(p=>row([jump(s,p.timestamp,n(p.elapsed)+' min'),esc(date(p.timestamp)),p.metric==='chat'?'Chat messages':'Tool interactions',n(p.count),n(p.baseline),esc(p.context.join(', ')||'No event marker')])).join('')||empty(6,'No qualifying activity bursts in the measured minutes.');
  const w=c.welcomeSummary;$('coachWelcomeSummary').textContent=`${w.acknowledged} of ${w.eligible} first recorded chatters acknowledged · median recorded delay: ${n(w.medianSeconds)} seconds. Unacknowledged accounts are excluded from the median; missing marks do not prove a greeting was missed.`;
  options('coachWelcomeAccount',c.welcomes.map(w=>[w.account,`${w.username} · ${w.platform}`]));
  $('coachWelcomes').innerHTML=c.welcomes.map(w=>row([esc(w.username),esc(w.platform),jump(s,w.firstAt,n(elapsed(s,w.firstAt))+' min'),w.acknowledgedAt?esc(date(w.acknowledgedAt)):'Not marked',n(w.delaySeconds),w.id?remove('welcomes',w.id):'—'])).join('')||empty(6,'No first recorded chatters in this selection.');
  $('coachHealth').innerHTML=c.health.map(h=>row([esc(h.platform),pct(h.coverage),n(h.measured)+' / '+n(h.expected),n(h.missing),n(h.longestGap),h.gaps.map(g=>`${jump(s,g.timestamp,n(elapsed(s,g.timestamp))+' min')} (${g.minutes} min gap)`).join(' ') + (h.gapCount>20?' · first 20 gaps shown':'')])).join('')||empty(6,'No platform telemetry available.');
 }
 window.renderCoaching=r=>{
  report=r;options('coachStream',r.sessions.filter(s=>s.detail.coaching).map(s=>[s.id,date(s.startedAt)+' · '+(s.title||s.platforms.join(', '))]));renderStream();
  const reviews=r.coaching?.experiments||[];
  options('coachReviewExperiment',reviews.map(e=>[e.id,e.hypothesis]));
  $('coachReviewWindow').textContent=`Review window: ${date(r.coaching.weekStart)} – ${date(r.coaching.weekEnd)}. Counts use the current report filters. Comparison values use every selected baseline/trial stream, not just this week.`;
  $('coachReviews').innerHTML=reviews.map(e=>row([esc(e.hypothesis)+'<br><small>'+esc({medianOpeningChange:'Opening audience change (viewers)',medianFollowsPerHour:'Follows / hour',medianReturningPercent:'Returning participants (percentage points)'}[e.metric]||'')+'</small>',n(e.recentStreams),`${e.baselineSamples} / ${e.trialSamples}`,n(e.difference),esc(e.status),e.reviews.map(v=>`<p>${esc(v.week)} · ${esc(v.decision)}: ${esc(v.notes)} ${remove('reviews',v.id)}</p>`).join('')||'Not reviewed'])).join('')||empty(6,'Create an experiment in Growth to review it here.');
 };
 function markerTime(id){const s=selected();if(!s||s.source!=='platform')throw new Error('Select a recorded broadcast.');const value=$(id).value;if(value.trim()===''||!Number.isFinite(Number(value))||Number(value)<0)throw new Error('Enter a non-negative elapsed minute.');return {sessionId:s.growthId,timestamp:new Date(Date.parse(s.startedAt)+Number(value)*60000).toISOString()};}
 $('coachStream').addEventListener('change',()=>{$('coachSegmentId').value='';renderStream();});
 $('coachSegmentForm').addEventListener('submit',async e=>{e.preventDefault();try{if(await save({type:'segment',id:$('coachSegmentId').value||undefined,...markerTime('coachSegmentMinute'),label:$('coachSegmentLabel').value})){$('coachSegmentId').value='';}}catch(err){status(err.message);}});
 $('coachSegmentNew').addEventListener('click',()=>{$('coachSegmentId').value='';$('coachSegmentForm').reset();});
 $('coachSegmentNow').addEventListener('click',async()=>{const s=selected();if(!s||!s.estimatedEnd||Date.now()-Date.parse(s.endedAt)>5*60000){status('A recent unclosed broadcast is needed to mark now. Use an elapsed minute for past streams.');return;}await save({type:'segment',sessionId:s.growthId,timestamp:new Date().toISOString(),label:$('coachSegmentLabel').value});});
 $('coachWelcomeForm').addEventListener('submit',async e=>{e.preventDefault();try{await save({type:'welcome',...markerTime('coachWelcomeMinute'),account:$('coachWelcomeAccount').value});}catch(err){status(err.message);}});
 $('coachWelcomeNow').addEventListener('click',async()=>{const s=selected();if(!s||!s.estimatedEnd||Date.now()-Date.parse(s.endedAt)>5*60000){status('Select a recent unclosed broadcast to acknowledge now.');return;}await save({type:'welcome',sessionId:s.growthId,timestamp:new Date().toISOString(),account:$('coachWelcomeAccount').value});});
 $('coachReviewDate').value=new Date().toISOString().slice(0,10);
 $('coachReviewForm').addEventListener('submit',async e=>{e.preventDefault();await save({type:'review',experimentId:$('coachReviewExperiment').value,week:$('coachReviewDate').value,decision:$('coachReviewDecision').value,notes:$('coachReviewNotes').value});});
 $('coachingPanel').addEventListener('click',async e=>{
  const j=e.target.closest('[data-coach-jump]');if(j){showView('overview');window.focusStreamMoment(j.dataset.session,j.dataset.coachJump);return;}
  const d=e.target.closest('[data-coach-remove]');if(d){await save({type:'remove',collection:d.dataset.collection,id:d.dataset.coachRemove});return;}
  const edit=e.target.closest('[data-segment-edit]');if(edit){const s=selected(),m=s.detail.coaching.segments.find(m=>m.id===edit.dataset.segmentEdit);if(Date.parse(m.timestamp)<Date.parse(s.startedAt)){status('Expand the date range to edit this segment’s original start.');return;}$('coachSegmentId').value=m.id;$('coachSegmentMinute').value=elapsed(s,m.timestamp);$('coachSegmentLabel').value=m.label;$('coachSegmentLabel').focus();}
 });
 $('coachDownload').addEventListener('click',()=>{
  const s=selected();if(!s)return;const content=JSON.stringify({title:s.title,startedAt:s.startedAt,endedAt:s.endedAt,filters:report.filters,generatedAt:report.generatedAt,coaching:s.detail.coaching},null,2),url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='stream-coaching-'+s.startedAt.slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
})();
