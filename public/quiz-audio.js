// Original arcade tones, generated locally: no downloads or third-party audio.
(() => {
  let context, master, previous, current, activeKey='';
  const played = new Set();
  const motifs = {question:[523,784],tick:[880],reveal:[392,523,659],podium:[659,784,1047],sudden:[220,330,220,660],victory:[523,659,784,1047],defeat:[392,330,262,131]};
  function sync() { if(master)master.gain.value=current?.audio?.muted?0:(current?.audio?.volume ?? .35)*.16; }
  function cue(name,key) {
    if(played.has(key))return; played.add(key);
    if(current?.audio?.muted || (current?.audio?.volume ?? .35)===0)return;
    try {
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      if(!context){context=new Audio();master=context.createGain();master.connect(context.destination);}
      sync();void context.resume().catch(()=>{});
      motifs[name].forEach((frequency,i)=>{
        const start=context.currentTime+i*.115,osc=context.createOscillator(),gain=context.createGain();
        osc.type='square';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.7,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+.11);
        osc.connect(gain);gain.connect(master);osc.start(start);osc.stop(start+.12);osc.onended=()=>{osc.disconnect();gain.disconnect();};
      });
    } catch { /* Audio must never block the quiz. */ }
  }
  window.QuizAudio = {
    observe(g) {
      current=g;sync();const key=`${g.gameId}:${g.round}:${g.phase}`;
      if(key===activeKey)return;
      const old=previous;previous={gameId:g.gameId,round:g.round,phase:g.phase};activeKey=key;
      if(g.gameId!==old?.gameId)played.clear();
      // Joining/reconnecting during results must not replay the result sounds.
      if(!old || old.gameId!==g.gameId)return;
      if(g.phase==='question')cue(g.suddenDeath&&g.round===g.questionCount+1?'sudden':'question',key);
      if(['reveal','completed'].includes(g.phase)&&old.phase==='question'){
        cue('reveal',key);if(g.roundResult?.podium?.length)setTimeout(()=>{if(activeKey===key)cue('podium',key+':podium');},420);
      }
    },
    tick(g) {
      if(g.phase!=='question')return;const seconds=Math.ceil((g.deadline-Date.now())/1000);
      if(seconds>=1&&seconds<=3)cue('tick',`${g.gameId}:${g.round}:tick:${seconds}`);
    },
    outcome(g) {
      if(current?.gameId===g.gameId&&current?.phase==='completed'&&played.has(`${g.gameId}:${g.round}:completed`))cue(g.winners.length?'victory':'defeat',`${g.gameId}:outcome`);
    },
  };
})();
