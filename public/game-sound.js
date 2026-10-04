// Original synthesised arcade cues. No network requests or downloaded audio.
(() => {
 const params=new URLSearchParams(window.location?.search||'');
 const raw=Number(params.get('volume'));const volume=params.has('volume')&&Number.isFinite(raw)?Math.max(0,Math.min(100,raw))/100:.3;
 const muted=params.get('muted')==='1';let context,master,previous=null,current=null;
 const played=new Set();
 const voices={escape:'sine',higher:'triangle',split:'sine',boss:'sawtooth',number:'square',snacks:'triangle',hill:'triangle'};
 const motifs={round:[392,587,784],tick:[880],reveal:[330,440,659],victory:[523,659,784,1047,1319],defeat:[330,294,220,147],hit:[110,65,49],block:[784,1047],heal:[523,784,1047],slam:[98,65,33],breath:[220,165,110],sweep:[330,220,147],join:[659,784],crown:[392,523,659,784,1047]};
 function cue(name,key,id){
  if(played.has(key))return;played.add(key);if(played.size>300)played.delete(played.values().next().value);
  if(muted||!volume)return;
  try{
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
   if(!context){context=new Audio();master=context.createGain();master.gain.value=volume*.075;master.connect(context.destination);}
   // Do not queue old effects for playback after an autoplay restriction lifts.
   if(context.state==='suspended'){void context.resume().catch(()=>{});return;}
   (motifs[name]||motifs.reveal).forEach((frequency,index)=>{
    const oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime+index*.095;
    oscillator.type=voices[id]||'triangle';oscillator.frequency.setValueAtTime(frequency,at);
    if(name==='hit')oscillator.frequency.exponentialRampToValueAtTime(frequency*.35,at+.16);
    gain.gain.setValueAtTime(.001,at);gain.gain.linearRampToValueAtTime(.75,at+.008);gain.gain.exponentialRampToValueAtTime(.001,at+.19);
    oscillator.connect(gain);gain.connect(master);oscillator.start(at);oscillator.stop(at+.2);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
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
   else if(g.phase==='completed')cue(['boss','escape','number'].includes(id)&&!g.result?.success?'defeat':'victory',key,id);
   else if(g.phase==='reveal')cue(id==='boss'?'hit':'reveal',key,id);
   else if(['question','battle','topic'].includes(g.phase))cue('round',key,id);
  },
  tick(g,id){if(!['question','battle','topic'].includes(g.phase))return;const end=typeof g.endsAt==='string'?Date.parse(g.endsAt):g.endsAt;const seconds=Math.ceil((end-Date.now())/1000);if(seconds>0&&seconds<=3)cue('tick',`${g.gameId}:${g.round}:${g.phase}:tick:${seconds}`,id);},
 };
})();
