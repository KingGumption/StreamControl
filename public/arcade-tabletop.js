(() => {
 const {c,rect,path,ellipse,text,wrapped,art,gradient,line,banner,score,clock,stageArt,serif,sans,mono,center,scenes}=ArcadeDraw;
 const rank=n=>({1:'A',11:'J',12:'Q',13:'K'})[n]||String(n);
 function playingCard(x,y,angle,n,back,p,flip=1){
  c.save();c.translate(x,y);c.rotate(angle);c.scale(Math.max(.025,flip),1);
  rect(-90,-124,186,256,'#071c18a0',12);
  rect(-94,-132,188,258,'#fbefd7',12);rect(-86,-124,172,242,back?p.ink:'#fcf6e5',8);
  if(back){
   c.save();c.beginPath();c.rect(-80,-118,160,230);c.clip();
   for(let i=-360;i<220;i+=17){line(i,-123,i+245,123,p.a,2);line(i,123,i+245,-123,p.a,2);}
   c.restore();ellipse(0,-3,48,54,'#f5e2bc');ellipse(0,-3,42,48,p.ink);text('?',0,-5,58,p.b,{...center,font:serif});
  }else{
   const red=n%2===0,ink=red?'#ac393d':'#213330',suit=red?'♦':'♠';
   text(rank(n),-75,-103,35,ink,{font:serif});text(suit,-69,-73,19,ink);
   if(n<=10){
    const pips=[];
    if(n<4){if(n>1)pips.push([0,-57],[0,57]);}
    else for(const x of [-33,33]){
     const ys=n>=9?[-67,-22,22,67]:n>=6?[-62,0,62]:[-57,57];
     ys.forEach(y=>pips.push([x,y]));
    }
    if([1,3,5,9].includes(n))pips.push([0,0]);
    if([7,8,10].includes(n))pips.push([0,-32]);
    if([8,10].includes(n))pips.push([0,32]);
    pips.forEach(([x,y])=>text(suit,x,y,n===1?96:30,ink,{...center,font:serif}));
   }else{text(n===12?'♛':n===13?'♚':'♞',0,0,100,ink,{...center,font:serif});}
   c.rotate(Math.PI);text(rank(n),-75,-96,35,ink,{font:serif});
  }c.restore();
 }
 scenes.higher=(g,p,t,age,vote)=>{
  const ask=g.phase==='question';
  rect(0,0,1080,640,'#103a32');art(stageArt('higher-keyart'),0,0,1080,640,{alpha:.38});
  ellipse(541,330,675,398,'#b39b65',3);ellipse(541,330,662,386,'#e1c28b',1);
  text('Higher or Lower',540,56,57,'#f5dfae',{...center,font:serif,italic:true});text('DRAW '+g.round+' / '+g.rounds,44,49,22,p.b,{font:mono});text(clock(g),1034,48,24,p.b,{align:'right',font:mono});
  const enter=Math.max(0,1-age/550),flip=ask?1:Math.min(1,age/360);
  for(let i=0;i<4;i++){rect(598+i*2,175-i*3,182,250,i%2?'#ddc59a':'#2c3e35',9);}
  playingCard(391,296,-.085,g.previousCard||g.card,false,p);
  playingCard(684+enter*124,296-enter*40,.075+enter*.25,g.card,ask,p,flip);
  if(ask&&g.answered){
   const count=Math.min(7,g.answered),jump=Math.max(0,1-vote/400);
   for(let i=0;i<count;i++){
    const y=363-i*5-(i===count-1?jump*74:0);
    ellipse(915,y,33,13,i%2?p.b:p.a);ellipse(915,y-1,27,8,p.ink,2);
   }
   text(g.answered+' IN PLAY',915,390,18,'#ffedc5',{...center,font:mono});
  }
  text('ON THE TABLE',389,453,20,'#ffeece',{...center,font:mono});text(ask?'THE DRAW':rank(g.card)+' REVEALED',686,453,20,'#ffeece',{...center,font:mono});
  if(g.cardHistory?.length>1){
   text('PAST DRAWS',50,233,16,p.b,{font:mono});
   g.cardHistory.slice(0,-1).slice(-5).forEach((n,i)=>{
    rect(48+i*15,253+i*19,44,59,'#f7e8cc',4);
    text(rank(n),53+i*15,267+i*19,19,'#233c30',{font:serif});
   });
  }
  for(const [i,label] of ['Higher','Lower'].entries()){
   const x=300+i*345,winner=!ask&&g.result?.winner===i;
   ellipse(x,517,45,22,'#061811');for(let j=0;j<3;j++)ellipse(x,512-j*3,43,18,winner?p.b:i?p.a:'#d6aa73');
   ellipse(x,504,35,13,p.ink,2);text(i+1,x,504,20,p.ink,{...center,font:mono});
   text(label,x+56,507,33,winner?p.b:'#fff4db',{font:serif,italic:true});
  }
  banner(ask?'Type 1 for higher or 2 for lower. Ace is low.':(g.phase==='completed'&&score(g)?score(g)+'   ·   ':'')+g.result.text,p);
 };
 function person(x,y,scale,color){
  const s=scale;ellipse(x,y-12*s,4.7*s,4.9*s,color);path([[x-8*s,y+2*s],[x-6*s,y-5*s],[x+6*s,y-5*s],[x+8*s,y+2*s]],color);
 }
 scenes.split=(g,p,t,age,vote)=>{
  const ask=g.phase==='question',counts=g.result?.counts||[0,0],difference=(counts[1]-counts[0])/Math.max(1,...counts);
  const tilt=ask?Math.sin(t*.65)*.021:Math.min(age/650,1)*difference*.13;
  rect(0,0,1080,640,'#f4e6c7');path([[0,0],[745,0],[350,640],[0,640]],'#ddd5b4');
  for(let x=-200;x<1150;x+=40)line(x,0,x-130,640,'#102c2810',1);
  text('Split the Crowd',47,73,67,'#21352d',{font:serif,italic:true});text('ROUND '+g.round+' / '+g.rounds+'   '+clock(g),1032,63,22,'#21352d',{align:'right',font:mono});
  text(ask?'Pick the smaller side.':'The crowd weighs in.',51,133,28,'#3b514a',{font:serif});
  const axisY=377;
  c.save();c.translate(540,axisY);c.rotate(tilt);rect(-389,-9,778,18,'#1b3733',8);
  [-1,1].forEach((dir,i)=>{
   const x=dir*286,y=68,accent=i?p.a:p.b;
   line(x,0,x-105,y+18,'#334f48',3);line(x,0,x+105,y+18,'#334f48',3);
   path([[x-120,y+12],[x+120,y+12],[x+91,y+35],[x-91,y+35]],'#274b43');
   const visible=ask?0:Math.min(28,counts[i]);
   for(let j=0;j<visible;j++)person(x-80+(j%9)*20,y+9-Math.floor(j/9)*15,1, '#395e4b');
   if(ask){ellipse(x,y-11,25,22,accent);text('?',x,y-11,23,'#18282c',center);}
  });c.restore();
  path([[485,505],[540,356],[595,505]],'#26463c');ellipse(540,axisY,16,16,'#cca86d');rect(449,502,182,12,'#26463c',3);
  if(ask&&g.answered){
   const travel=Math.min(1,vote/480);c.save();c.translate(540,265+travel*34);c.rotate((1-travel)*.2);
   rect(-41,-21,82,42,'#fbefdb',3);text(g.answered,0,-1,24,'#203c32',{...center,font:mono});c.restore();
   text('LOCKED IN',540,332,14,'#314a40',{...center,font:mono});
  }
  g.options.forEach((op,i)=>{
   const x=252+i*576;ellipse(x,196,28,28,'#234037');text(i+1,x,195,29,'#f8e9c7',{...center,font:mono});
   wrapped(op.name,x,262,450,2,43,'#18352b',{...center,font:serif});
   if(!ask)text(counts[i]+' votes'+(g.result.winner===i?'  ·  +1 POINT':''),x,321,22,'#344e3e',center);
  });
  banner(ask?'Type 1 or 2. The smaller group scores.':(g.phase==='completed'&&score(g)?score(g):g.result.text),p);
 };
 function star(x,y,r,color,angle=0){
  const points=Array.from({length:26},(_,i)=>{const a=angle+i*Math.PI/13,l=i%2?r*.72:r;return [x+Math.cos(a)*l,y+Math.sin(a)*l];});path(points,color);
 }
 scenes.snacks=(g,p,t,age)=>{
  const ask=g.phase==='question',winner=g.result?.winner;
  rect(0,0,1080,640,'#f5e4b7');path([[0,0],[567,0],[415,640],[0,640]],'#be403c');path([[595,0],[1080,0],[1080,640],[425,640]],'#24505c');
  for(let i=0;i<22;i++){const x=540+Math.cos(i*.285)*1200,y=315+Math.sin(i*.285)*850;line(540,315,x,y,'#f2cf8033',8);}
  rect(24,18,1032,75,'#251c25');text('SNACK WARS',540,52,62,'#fce9bd',{...center,font:serif,italic:true});
  text('BOUT '+g.round,48,53,23,p.b,{font:mono});text(clock(g),1028,54,24,p.b,{align:'right',font:mono});
  g.options.forEach((o,i)=>{
   const x=i?807:268,win=!ask&&winner===i;
   text(i?'THE WORLD':'BRITAIN',x,124,25,'#ffeac7',{...center,font:mono});
   c.save();c.translate(x,286);c.rotate(i?.065:-.065);
   star(0,0,137,win?p.b:'#ecd8bb',.1);art(o.image||'/assets/game-art/snacks.svg',-112,-115,224,230,{mode:'contain'});c.restore();
   text(o.origin||'',x,431,18,'#fff8df',{...center,font:mono,max:470});
   wrapped(o.name,x,482,459,2,39,'#fff8df',{...center,font:serif,italic:true});
   text(ask?'TYPE '+(i+1):g.result.counts[i]+' VOTES',x,538,24,'#fff0c5',{...center,font:mono});
  });
  const stamp=ask?'VS':winner>=0?String(winner+1):'=';
  star(540,284,86,p.b,Math.min(age/500,1)*.18);text(stamp,540,282,51,'#2c2426',{...center,font:serif,italic:true});
  if(ask&&g.answered)text(g.answered+(g.answered===1?' VOTE':' VOTES'),540,374,16,'#fff4d0',{...center,font:mono});
  const [a,b]=g.teamScores;
  banner(ask?'Vote for your snack in chat    ·    Britain '+a+'  /  World '+b:g.phase==='completed'?(a===b?'Draw':a>b?'Britain wins!':'The World wins!')+'    '+a+' — '+b:g.result.text,p);
 };
})();
