const url = new URL(location.href);
// Streamer.bot owns the event fields. Resolve just the frame before loading the card.
async function resolveStreamFrame(){
 const key='stream-graphics-frame';let theme;
 try{const r=await fetch('https://streamengagement.onrender.com/graphics/state',{cache:'no-store',signal:AbortSignal.timeout(1200)});if(!r.ok)throw Error();theme=(await r.json()).theme;try{localStorage.setItem(key,theme||'')}catch{}}catch{try{theme=localStorage.getItem(key)}catch{}}
 const frame=({classic:'standard',spooktober:'spooky',vicecity:'vicecity',christmas:'christmas'})[theme];
 if(frame){url.searchParams.set('frame',frame);history.replaceState(null,'',url);}
}
