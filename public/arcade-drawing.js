/* Drawing coordinates are the broadcast source's 1080 × 640 logical pixels. */
(() => {
 const c=document.getElementById('board').getContext('2d'), images=new Map();
 const serif='Georgia,serif', sans='"Segoe UI",Arial,sans-serif', mono='Consolas,monospace';
 function rect(x,y,w,h,color,r=0){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
 function path(points,color,stroke=false,width=1){
  c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));
  if(!stroke){c.closePath();c.fillStyle=color;c.fill();}else{c.lineWidth=width;c.strokeStyle=color;c.stroke();}
 }
 function ellipse(x,y,rx,ry,color,line=0){
  c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,Math.PI*2);
  if(line){c.strokeStyle=color;c.lineWidth=line;c.stroke();}else{c.fillStyle=color;c.fill();}
 }
 function text(value,x,y,size,color='#fff',style={}){
  const {font=sans,weight=700,align='left',max=1000,italic=false}=style;
  c.font=(italic?'italic ':'')+weight+' '+size+'px '+font;c.textAlign=align;c.textBaseline='middle';c.fillStyle=color;
  c.fillText(String(value??''),x,y,max);
 }
 function wrapped(value,x,y,max,lines,size,color,options={}){
  c.font=(options.weight||700)+' '+size+'px '+(options.font||sans);
  const words=String(value||'').split(/\s+/),out=[''];
  for(const word of words){
   const last=out.length-1,next=out[last]?out[last]+' '+word:word;
   if(out[last]&&c.measureText(next).width>max&&out.length<lines)out.push(word);else out[last]=next;
  }
  out.forEach((line,i)=>text(line,x,y+(i-(out.length-1)/2)*size*1.08,size,color,{...options,max}));
 }
 function art(src,x,y,w,h,{mode='cover',alpha=1}={}){
  if(!src)return;
  if(!images.has(src)){
   const img=new Image();img.referrerPolicy='no-referrer';img.src=src;images.set(src,img);
   if(images.size>128)images.delete(images.keys().next().value);
  }
  const img=images.get(src);if(!img.naturalWidth)return;
  const s=(mode==='cover'?Math.max:Math.min)(w/img.naturalWidth,h/img.naturalHeight);
  c.save();c.globalAlpha*=alpha;c.beginPath();c.rect(x,y,w,h);c.clip();
  const dw=s*img.naturalWidth,dh=s*img.naturalHeight;c.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);c.restore();
 }
 function gradient(x,y,u,v,stops){const g=c.createLinearGradient(x,y,u,v);stops.forEach(([p,col])=>g.addColorStop(p,col));return g;}
 function line(x,y,u,v,col,w=1){path([[x,y],[u,v]],col,true,w);}
 function dial(x,y,r,n,colour,angle=0){for(let i=0;i<n;i++){const a=angle+i*2*Math.PI/n,k=i%5===0?.82:.92;line(x+Math.cos(a)*r*k,y+Math.sin(a)*r*k,x+Math.cos(a)*r,y+Math.sin(a)*r,colour,i%5===0?3:1.5);}}
 function banner(message,p){
  if(!message)return;
  rect(0,563,1080,77,p.ink);rect(0,563,1080,3,p.a);
  wrapped(message,540,602,1000,2,23,'#fff',{align:'center'});
 }
 function score(g){
  const best=g.leaderboard?.[0];if(!best?.score)return '';
  const names=g.leaderboard.filter(p=>p.score===best.score).slice(0,3).map(p=>p.username);
  return names.join(' / ')+'  ·  '+best.score+' pts';
 }
 function clock(g){
  const remaining=Math.max(0,Math.ceil((g.endsAt-Date.now())/1000));
  return g.phase==='completed'?'FINAL':g.phase==='reveal'?'REVEAL':remaining?remaining+'s':'LAST CALL';
 }
 function stageArt(name){return '/assets/stage-art/'+name+'.webp';}
 window.ArcadeDraw={c,rect,path,ellipse,text,wrapped,art,gradient,line,dial,banner,score,clock,stageArt,serif,sans,mono,
  center:{align:'center'},scenes:{}};
})();
