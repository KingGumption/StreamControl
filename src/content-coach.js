// Published-content analytics. This module intentionally has no stream-data dependency.
const PLATFORMS=['youtube','instagram','twitch','tiktok'];
const WINDOWS={'24h':[21,27],'7d':[156,180],'28d':[648,696]};
const METRICS=['views','reach','impressions','likes','comments','shares','saves','followers','averageViewSeconds','completionPercent','ctrPercent'];
const RATE_METRICS=['watchPercent','sharesPer1000','savesPer1000','followersPer1000','completionPercent','ctrPercent'];
function text(v,max=200,required=false){if(v==null)v='';if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))throw Error(`Text must be ${required?'1':'0'}–${max} characters.`);return v.trim();}
function choice(v,values,label){if(!values.includes(v))throw Error(`Choose a supported ${label}.`);return v;}
function number(v,name,{max=Number.MAX_SAFE_INTEGER,integer=false}={}){if(v==null||v==='')return null;if(typeof v==='boolean'||typeof v==='object'||(typeof v==='string'&&!v.trim()))throw Error(`${name} must be a number or blank.`);const n=Number(v);if(!Number.isFinite(n)||n<0||n>max||(integer&&!Number.isSafeInteger(n)))throw Error(`Invalid ${name}.`);return n;}
function timestamp(v,now){const value=text(v,40,true);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value))||Date.parse(value)>now)throw Error('Use a valid timestamp with timezone, not in the future.');const date=value.slice(0,10);if(new Date(date).toISOString().slice(0,10)!==date)throw Error('Invalid calendar date.');return new Date(value).toISOString();}
function link(value,platform){let u;try{u=new URL(text(value,1500,true));}catch{throw Error('Use a valid HTTPS post link.');}if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Use an HTTPS link without credentials or a custom port.');const host=u.hostname.toLowerCase().replace(/^www\./,'');const allowed={youtube:['youtube.com','m.youtube.com','youtu.be'],instagram:['instagram.com'],twitch:['twitch.tv','clips.twitch.tv'],tiktok:['tiktok.com','m.tiktok.com']};if(!allowed[platform]?.includes(host))throw Error('Post link must belong to the selected platform.');
 if(platform==='youtube'){const id=host==='youtu.be'?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(shorts|embed)\/([^/]+)\/?$/)?.[2];if(!/^[\w-]{11}$/.test(id||''))throw Error('Use a YouTube video or Short link.');return `https://www.youtube.com/watch?v=${id}`;}
 if(platform==='instagram'){const id=u.pathname.match(/^\/(p|reel|tv)\/([\w-]+)\/?$/)?.[2];if(!id)throw Error('Use an Instagram post or Reel link.');return `https://instagram.com/p/${id}`;}
 if(platform==='tiktok'){const match=u.pathname.match(/^\/@([A-Za-z0-9._-]+)\/video\/(\d+)\/?$/);if(!match)throw Error('Use a full TikTok video link (not a short redirect link).');return `https://www.tiktok.com/@${match[1].toLowerCase()}/video/${match[2]}`;}
 if(platform==='twitch'&&!(host==='clips.twitch.tv'&&/^\/[\w-]+$/.test(u.pathname)||/^\/(videos\/\d+|[^/]+\/clip\/[\w-]+)\/?$/.test(u.pathname)))throw Error('Use a Twitch clip or edited-highlight link.');
 const clip=u.pathname.match(/^\/[^/]+\/clip\/([\w-]+)\/?$/)?.[1];if(platform==='twitch'&&clip)return `https://clips.twitch.tv/${clip}`;
 return `https://${host}${u.pathname.replace(/\/$/,'')}`;
}
function normalize(row,now=Date.now()){
 const platform=choice(row.platform,PLATFORMS,'platform'),format=choice(row.format,['short','long'],'format');
 const publishedAt=timestamp(row.publishedAt,now),observedAt=timestamp(row.observedAt,now),ageHours=(Date.parse(observedAt)-Date.parse(publishedAt))/3600000;
 if(ageHours<0)throw Error('Observation must be after publication.');const window=choice(row.window,[...Object.keys(WINDOWS),'lifetime'],'measurement window');
 if(WINDOWS[window]&&(ageHours<WINDOWS[window][0]||ageHours>WINDOWS[window][1]))throw Error(`${window} observations must be ${WINDOWS[window].join('–')} hours after publication. Use lifetime for other ages.`);
 const out={platform,format,url:link(row.url,platform),title:text(row.title,300,true),publishedAt,observedAt,window,traffic:choice(row.traffic,['organic','paid','unknown'],'traffic type'),durationSeconds:number(row.durationSeconds,'duration',{max:86400}),group:text(row.group,100),topic:text(row.topic,100),hook:text(row.hook,500),notes:text(row.notes,2000),source:text(row.source,300,true)};
 if(!out.durationSeconds)throw Error('Duration must be greater than zero.');
 for(const key of METRICS)out[key]=number(row[key],key,{max:key.endsWith('Percent')?100:Number.MAX_SAFE_INTEGER,integer:!['averageViewSeconds','completionPercent','ctrPercent'].includes(key)});
 if(!METRICS.some(k=>out[k]!=null))throw Error('Enter at least one measured metric.');
 out.id=JSON.stringify([platform,out.url,window]);return out;
}
function median(values){const a=values.filter(v=>v!=null&&Number.isFinite(v)).sort((x,y)=>x-y),n=a.length;return n?(a[Math.floor(n/2)]+a[Math.floor((n-1)/2)])/2:null;}
function durationBand(r){return r.format==='short'?(r.durationSeconds<=30?'≤30s':r.durationSeconds<=60?'31–60s':'>60s'):(r.durationSeconds<=600?'≤10m':r.durationSeconds<=1800?'10–30m':'>30m');}
const cohortKey=r=>JSON.stringify([r.platform,r.format,r.window,r.traffic,durationBand(r)]);
function rates(r){const rate=k=>r[k]!=null&&r.views>0?r[k]/r.views*1000:null;return {watchPercent:r.averageViewSeconds==null?null:r.averageViewSeconds/r.durationSeconds*100,sharesPer1000:rate('shares'),savesPer1000:rate('saves'),followersPer1000:rate('followers'),completionPercent:r.completionPercent,ctrPercent:r.ctrPercent};}
function analyze(records){
 const enriched=records.map(r=>({...r,...rates(r),durationBand:durationBand(r)}));
 const groups=new Map();for(const r of enriched){const key=cohortKey(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 return enriched.map(r=>{
  const peers=r.window==='lifetime'||r.traffic!=='organic'?[]:groups.get(cohortKey(r)).filter(p=>p.url!==r.url&&p.publishedAt<r.publishedAt);
  const baseline={};for(const key of ['views',...RATE_METRICS]){const values=peers.map(p=>p[key]).filter(v=>v!=null);baseline[key]={n:values.length,median:values.length>=5?median(values):null};}
  const base=baseline.views.median,multiple=base>0&&r.views!=null?r.views/base:null;
  const signals=[];
  const test=(metric,label,suggestion)=>{const b=baseline[metric];if(b.median==null||r[metric]==null)return;if(r[metric]<b.median*.8)signals.push({kind:'Experiment',metric,evidence:`${label} is below the median of ${b.n} earlier comparable posts.`,suggestion});};
  test('watchPercent','Average percentage watched',r.format==='short'?'Test showing the payoff in the first seconds; shorten the setup.':'Test a shorter introduction that delivers the title’s promise earlier.');
  if(r.format==='long')test('ctrPercent','Reported impression click-through rate','Test one title or thumbnail change while keeping the promise accurate.');
  test('sharesPer1000','Shares per 1,000 views','Test a clearer useful takeaway or a moment viewers would want to send to someone.');
  test('followersPer1000','Followers gained per 1,000 views','Test a specific reason to follow for the next related post.');
  if(multiple>=1.5)signals.unshift({kind:'Measured result',metric:'views',evidence:`${multiple.toFixed(1)}× the median views of ${baseline.views.n} earlier comparable posts.`,suggestion:'Try a follow-up on the same topic, changing one creative element. This does not establish why it worked.'});
  return {...r,baseline,multiple,signals};
 });
}
function experiments(items,records){const map=new Map(records.map(r=>[r.id,r]));return items.map(e=>{const a=e.baseline.map(id=>map.get(id)),b=e.trial.map(id=>map.get(id)),all=[...a,...b];const comparable=all.length>0&&all.every(Boolean)&&new Set(all.map(cohortKey)).size===1&&all.every(r=>r.window!=='lifetime'&&r.traffic==='organic')&&new Set(all.map(r=>r.url)).size===all.length;
 const av=a.filter(Boolean).map(r=>r[e.metric]).filter(v=>v!=null),bv=b.filter(Boolean).map(r=>r[e.metric]).filter(v=>v!=null);const am=comparable?median(av):null,bm=comparable?median(bv):null;
 return {...e,comparable,baselineN:av.length,trialN:bv.length,baselineMedian:am,trialMedian:bm,delta:am==null||bm==null?null:bm-am,preliminary:av.length<3||bv.length<3};});}
module.exports={PLATFORMS,WINDOWS,METRICS,RATE_METRICS,text,choice,link,normalize,median,cohortKey,analyze,experiments};
