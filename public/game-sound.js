// Original synthesised arcade cues. No network requests or downloaded audio.
(() => {
 const params=new URLSearchParams(window.location?.search||'');
 const raw=Number(params.get('volume'));const volume=params.has('volume')&&Number.isFinite(raw)?Math.max(0,Math.min(100,raw))/100:.3;
 const muted=params.get('muted')==='1';let context,master,previous=null,current=null;
 const played=new Set();let noiseBuffer;
 function texture(id,at){
  if(!context.createBuffer||!context.createBufferSource||!context.createBiquadFilter)return;
  if(!noiseBuffer){noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.5),context.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=noiseBuffer;
  const tone={higher:[2600,.07],number:[800,.18],escape:[340,.4],boss:[140,.3],snacks:[1800,.1],split:[1100,.14],hill:[1400,.17]}[id]||[1200,.15];
  filter.type='bandpass';filter.frequency.value=tone[0];filter.Q.value=.6;gain.gain.setValueAtTime(.28,at);gain.gain.exponentialRampToValueAtTime(.001,at+tone[1]);
  source.connect(filter);filter.connect(gain);gain.connect(master);source.start(at);source.stop(at+tone[1]);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
 }
 const voices={escape:'sine',higher:'triangle',split:'triangle',boss:'triangle',number:'triangle',snacks:'triangle',hill:'triangle'};
 const motifs={round:[392,587,784],tick:[880],reveal:[330,440,659],victory:[523,659,784,1047,1319],defeat:[330,294,220,147],hit:[110,65,49],block:[784,1047],heal:[523,784,1047],slam:[98,65,33],breath:[220,165,110],sweep:[330,220,147],join:[659,784],crown:[392,523,659,784,1047]};
 const palettes={escape:{notes:[196,233,294],speed:.16,decay:.38},higher:{notes:[330,494,659],speed:.06,decay:.12},split:{notes:[392,440,587],speed:.09,decay:.18},snacks:{notes:[523,659,880],speed:.085,decay:.15},number:{notes:[220,330,440],speed:.12,decay:.23},hill:{notes:[392,523,784],speed:.11,decay:.27},boss:{notes:[98,147,196],speed:.12,decay:.25}};
 motifs.draw=[392,392];motifs.charge=[147,196,294,392,587];
 function cue(name,key,id){
  if(played.has(key))return;played.add(key);if(played.size>300)played.delete(played.values().next().value);
  if(muted||!volume)return;
  try{
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
   if(!context){context=new Audio();master=context.createGain();master.gain.value=volume*.16;
    if(context.createDynamicsCompressor){const limiter=context.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=12;limiter.ratio.value=6;limiter.attack.value=.004;limiter.release.value=.16;master.connect(limiter);limiter.connect(context.destination);}else master.connect(context.destination);}
   // Do not queue old effects for playback after an autoplay restriction lifts.
   if(context.state==='suspended'){void context.resume().catch(()=>{});return;}
   const palette=palettes[id]||palettes.hill;
   if(!['tick','join'].includes(name))texture(id,context.currentTime);
   if(['victory','crown','defeat','slam','hit'].includes(name)){const bass=context.createOscillator(),env=context.createGain(),at=context.currentTime; bass.type='sine';bass.frequency.setValueAtTime(['defeat','slam','hit'].includes(name)?65:131,at);env.gain.setValueAtTime(.4,at);env.gain.exponentialRampToValueAtTime(.001,at+.55);bass.connect(env);env.connect(master);bass.start(at);bass.stop(at+.6);bass.onended=()=>{bass.disconnect();env.disconnect();};}
   (['round','reveal'].includes(name)?palette.notes:(motifs[name]||motifs.reveal)).forEach((frequency,index)=>{
    const oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime+index*palette.speed;
    oscillator.type=voices[id]||'triangle';oscillator.frequency.setValueAtTime(frequency,at);
    if(name==='hit')oscillator.frequency.exponentialRampToValueAtTime(frequency*.35,at+.16);
    gain.gain.setValueAtTime(.001,at);gain.gain.linearRampToValueAtTime(.75,at+.008);gain.gain.exponentialRampToValueAtTime(.001,at+palette.decay);
    oscillator.connect(gain);gain.connect(master);oscillator.start(at);oscillator.stop(at+palette.decay+.01);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
   });
  }catch{/* An unavailable audio device must never interrupt a game. */}
 }
 window.GameSound={
  effect(name,key){cue(name,`effect:${key}`,'boss');},
  observe(g,id){
   current=g;const key=`${g.gameId}:${g.round}:${g.phase}`;const old=previous;
   previous={key,gameId:g.gameId,phase:g.phase};if(old?.key===key)return;
   if(!old||old.gameId!==g.gameId){played.clear();return;}
   if(g.phase==='idle')return;
   if(g.phase==='champion')cue('crown',key,id);
   else if(g.phase==='completed')cue(['boss','escape','number'].includes(id)?(g.result?.success?'victory':'defeat'):(id==='snacks'?g.teamScores?.[0]!==g.teamScores?.[1]:(g.leaderboard?.[0]?.score||0)>0)?'victory':'draw',key,id);
   else if(g.phase==='reveal')cue(id==='boss'?'hit':g.result?.winner===-1&&['snacks','split'].includes(id)?'draw':'reveal',key,id);
   else if(['question','battle','topic'].includes(g.phase))cue('round',key,id);
  },
  tick(g,id){if(!['question','battle','topic'].includes(g.phase))return;const end=typeof g.endsAt==='string'?Date.parse(g.endsAt):g.endsAt;const seconds=Math.ceil((end-Date.now())/1000);if(seconds>0&&seconds<=3)cue('tick',`${g.gameId}:${g.round}:${g.phase}:tick:${seconds}`,id);},
 };
})();
