(() => {
 const {c,rect,path,ellipse,text,wrapped,art,gradient,line,dial,banner,score,clock,stageArt,serif,sans,mono,center,scenes}=ArcadeDraw;
 function arch(x,y,w,h){
  c.beginPath();c.moveTo(x,y+h);c.lineTo(x,y+w/2);c.arc(x+w/2,y+w/2,w/2,Math.PI,Math.PI*2);c.lineTo(x+w,y+h);c.closePath();
 }
 function door(x,y,w,h,chosen,age,p){
  for(let j=9;j>=0;j-=3){arch(x-j,y-j,w+2*j,h+j);c.fillStyle=j%2?'#443a31':'#ad8b60';c.fill();}
  arch(x,y,w,h);c.fillStyle='#100e12';c.fill();
  c.save();arch(x,y,w,h);c.clip();
  if(chosen){rect(x,y,w,h,gradient(x,y,x+w,y+h,[[0,p.b],[.65,'#5a4933'],[1,'#151d1d']]));}
  const hinge=chosen?1-Math.min(age/700,1)*.80:1;
  c.translate(x,y);c.scale(hinge,1);
  rect(0,0,w,h,'#392d2b');for(let j=0;j<7;j++){
   rect(j*w/7,0,w/7-2,h,gradient(0,0,w,h,[[0,j%2?'#69513c':'#5a4437'],[1,'#211b20']]));
  }
  for(const v of [.39,.76]){rect(0,h*v,w,8,'#211d22');[8,w-13].forEach(pos=>ellipse(pos,h*v+4,2,2,'#c39f6c'));}
  ellipse(w*.73,h*.57,9,10,'#d1ab77',3);c.restore();
 }
 scenes.escape=(g,p,t,age)=>{
  const ask=g.phase==='question',chosen=g.result?.route;
  const [room,detail]=(g.prompt||'The house: Choose a path.').split(':');
  const place=room.replace(/^The /i,'').toLowerCase();
  const image=['library','kitchen','cellar','garden','tower','crypt','attic','conservatory','ballroom'].includes(place)?place:'hall';
  rect(0,0,1080,640,'#17141b');art(stageArt('haunted-'+image),0,0,1080,640);
  rect(0,0,1080,640,gradient(0,0,0,640,[[0,'#0c0c14ed'],[.35,'#15121c77'],[.7,'#19151c77'],[1,'#121017']]));
  text(room,540,56,55,'#ffe6bf',{...center,font:serif,italic:true});
  text('ROOM '+g.round+' / '+g.rounds,37,52,20,p.b,{font:mono});text(clock(g),1040,52,24,p.b,{align:'right',font:mono});
  wrapped(detail?.trim()||'',540,114,875,2,27,'#f4dec5',{...center,font:serif});
  g.options.forEach((op,i)=>{
   const x=168+i*370;door(x-84,169,168,248,!ask&&chosen===i,age,p);
   // Each lintel carries a separate seal so the routes read as landmarks.
   const seal=i===0?'☾':i===1?'✧':'♜';
   text(seal,x,213,31,'#d1b681',{...center,font:serif});
   ellipse(x,281,24,24,'#211b1a');ellipse(x,281,24,24,p.b,2);text(i+1,x,281,28,p.b,{...center,font:serif});
   wrapped(op.name,x,462,324,2,29,'#fff0d9',{...center,font:serif});
   if(!ask)text((g.result.counts[i]||0)+' votes',x,506,20,p.b,{...center,font:mono});
  });
  rect(0,546,1080,94,'#101019ee');text('COURAGE',35,568,16,'#e9dbcd',{font:mono});
  for(let j=0;j<5;j++)text('♥',145+j*26,569,23,j<g.health?'#e68177':'#5b4a51',center);
  text(g.progress+' / '+g.rounds+' CLUES',1045,569,20,p.b,{align:'right',font:mono});
  wrapped(ask?'Type a door number in chat to choose the way out.':g.result.text,540,609,1000,2,22,'#fff1dc',{...center,font:serif});
 };
 function scanArc(cx,cy,r,from,to,colour,width){
  c.beginPath();c.arc(cx,cy,r,from,to);c.lineWidth=width;c.strokeStyle=colour;c.stroke();
 }
 scenes.number=(g,p,t,age)=>{
  const ask=g.phase==='question',blue='#7eddd2',cx=346,cy=309,r=189;
  const ink='#101c20',screen='#092c2c';
  rect(0,0,1080,640,gradient(0,0,1080,640,[[0,'#24383d'],[1,'#101a20']]));
  for(let x=12;x<1080;x+=22)line(x,0,x-85,640,'#c4ffed08',1);
  rect(44,69,603,479,'#10191d',48);rect(52,79,587,462,'#344448',45);
  [[76,102],[615,102],[76,517],[615,517]].forEach(([x,y])=>{ellipse(x,y,8,8,'#809089');line(x-4,y+4,x+4,y-4,'#152223',2);});
  ellipse(cx,cy,r+28,r+28,'#121e20');ellipse(cx,cy,r+17,r+17,'#45645c');ellipse(cx,cy,r+10,r+10,screen);
  c.save();c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.clip();
  for(let i=-9;i<=9;i++){line(cx+i*24,cy-r,cx+i*24,cy+r,'#51877a55');line(cx-r,cy+i*24,cx+r,cy+i*24,'#51877a55');}
  for(let i=1;i<=4;i++)ellipse(cx,cy,r*i/4,r*i/4,'#6fbaa24d',1);
  const direction=t*.75;
  for(let i=0;i<22;i++){const a=direction-i*.025;line(cx,cy,cx+r*Math.cos(a),cy+r*Math.sin(a),'rgba(117,236,177,'+(.5-i*.021)+')',3);}
  const start=-Math.PI/2+(g.range.low-1)/100*2*Math.PI,end=-Math.PI/2+g.range.high/100*2*Math.PI;
  scanArc(cx,cy,r-8,start,end,p.a,11);dial(cx,cy,r-28,100,'#a2bcb1');
  (g.result?.guesses||[]).slice(-45).forEach(v=>{
   const a=(v-1)/100*2*Math.PI-Math.PI/2;
   ellipse(cx+Math.cos(a)*(r-38),cy+Math.sin(a)*(r-38),5,5,p.b);
  });
  rect(cx-121,cy-30,242,64,'#0a2627ef');text(g.phase==='completed'?g.revealedNumber:g.range.low+'–'+g.range.high,cx,cy,50,'#c6f9cf',{...center,font:mono});c.restore();
  text('SECRET NUMBER',688,98,24,p.b,{font:mono});text('HUNT',681,174,88,'#e8f0d8',{font:mono});
  text('SEARCH '+String(g.round).padStart(2,'0')+' / '+g.rounds,689,246,24,blue,{font:mono});
  line(688,280,1038,280,'#748c80',2);
  text(g.phase==='completed'?'SEARCH CLOSED':'NUMBERS IN RANGE',688,307,18,'#b3c6b8',{font:mono});
  const width=g.range.high-g.range.low+1;
  text(g.phase==='completed'?(g.result.success?'FOUND':'MISSED'):String(width).padStart(3,'0'),683,365,59,'#fff3ca',{font:mono,max:353});
  for(let i=0;i<20;i++)rect(689+i*17,411,12,10,i<Math.ceil(width/5)?p.a:'#415156',1);
  text(clock(g),688,460,38,p.b,{font:mono});text(g.answered+(g.answered===1?' GUESS':' GUESSES'),688,505,22,blue,{font:mono});
  banner(ask?'Send a number from '+g.range.low+' to '+g.range.high+' in chat.':g.result.text,p);
 };
 function hp(x,y,w,n,max,color){
  rect(x,y,w,15,'#141321');rect(x+2,y+2,Math.max(.1,(w-4)*n/max),11,color);
  for(let i=1;i<10;i++)line(x+i*w/10,y+2,x+i*w/10,y+13,'#261f2a',2);
 }
 scenes.boss=(g,p,t,age)=>{
  const ask=g.phase==='question';
  rect(0,0,1080,640,'#241a2d');art(stageArt('boss-keyart'),0,0,1080,522);
  rect(0,0,1080,410,gradient(0,0,0,410,[[0,'#12121ced'],[.42,'#261b3322'],[1,'#27163000']]));
  text('CROWD BOSS BATTLE',34,28,17,p.b,{font:mono});text(g.boss.name,30,65,47,'#fff2c7',{font:serif,max:620});
  text('TURN '+g.round+'   '+clock(g),1044,44,27,p.b,{align:'right',font:mono});
  hp(34,105,390,g.partyHp,100,'#82d9bd');hp(655,105,390,g.bossHp,g.bossMaxHp,'#ef8483');
  text('PARTY  '+g.partyHp+'/100',35,139,18,'#fff2de',{font:mono});text('BOSS  '+g.bossHp+'/'+g.bossMaxHp,1044,139,18,'#fff2de',{font:mono,align:'right'});
  if(g.battle.bossGuard||g.battle.bossCharged||g.battle.enraged)text([g.battle.bossGuard?'Guarded':'',g.battle.bossCharged?'Charged':'',g.battle.enraged?'Enraged':''].filter(Boolean).join(' / '),1040,172,23,p.b,{align:'right'});
  const party=g.party||[];
  party.slice(0,5).forEach((member,i)=>{
   const x=45+i*123;
   rect(x-22,409,119,37,'#191b29d9',18);ellipse(x,427,19,19,member.voted?p.a:'#6c6870');ellipse(x,427,16,16,p.ink);
   c.save();c.beginPath();c.arc(x,427,15,0,Math.PI*2);c.clip();
   text((member.username||'?').slice(0,2).toUpperCase(),x,427,14,'#fff',center);
   if(member.profileImageUrl?.startsWith('https://'))art(member.profileImageUrl,x-15,412,30,30);c.restore();
   text(member.username,x+24,418,14,'#fff3d7',{max:66});
   text(member.voted?['ATTACK','DEFEND','HEAL'][member.action-1]:'READY',x+24,434,12,p.b,{font:mono,max:65});
  });
  rect(0,455,1080,185,'#171526');line(0,455,1080,455,p.b,4);
  for(const [i,o] of g.options.entries()){
   const x=25+i*350,chosen=g.result?.action===i;
   path([[x,480],[x+302,480],[x+326,512],[x+294,546],[x,546],[x+12,513]],chosen?p.b:i===0?'#7e414f':i===1?'#385c77':'#396552');
   text(i+1,x+40,512,31,chosen?p.ink:'#fff9de',{...center,font:mono});text(o.name,x+77,510,34,chosen?p.ink:'#fff9de',{font:serif});
   const count=g.moveCounts?.[i]||g.result?.counts?.[i]||0;
   text(count+(count===1?' vote':' votes'),x+306,511,17,chosen?p.ink:'#fff9de',{align:'right',font:mono});
   const help=[g.battle.focus?'Focused strike':'Strike the boss','Block 75% · charge attack','Restore HP · '+g.battle.potions+' potions'][i];
   text(help,x+14,564,18,'#eadbcd',{font:mono,max:320});
  }
  if(ask)text('Type 1, 2 or 3. The leading move commands the party.',540,609,23,'#f9e8ca',center);
  else wrapped(g.phase==='completed'?(g.result.success?'VICTORY · Boss defeated':'DEFEAT · Party fell'):g.result?.text,540,610,1014,2,20,'#fff0cf',center);
 };
})();
