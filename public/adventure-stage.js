/* Painted on the broadcast canvas. The map position, balance and loot tokens
   are derived from the public game snapshot and survive overlay reconnects. */
(() => {
  const canvas=document.getElementById('tableau'), ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let state=null, frame=0, last=0, palette={}, previous=null, changedAt=0, themeKey;
  function fill(col,x,y,w,h){ctx.fillStyle=col;ctx.fillRect(x,y,w,h);}
  function line(col,width,points,dash=[]){
    ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=width;ctx.setLineDash(dash);
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.setLineDash([]);
  }
  function polygon(col,points){
    ctx.beginPath();ctx.fillStyle=col;points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
  }
  function circle(col,x,y,r){ctx.beginPath();ctx.fillStyle=col;ctx.arc(x,y,r,0,2*Math.PI);ctx.fill();}
  function ring(col,x,y,r,w){ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=w;ctx.arc(x,y,r,0,2*Math.PI);ctx.stroke();}
  function text(col,value,x,y,size,align='center'){
    ctx.fillStyle=col;ctx.font='bold '+size+'px Consolas,monospace';ctx.textAlign=align;ctx.fillText(value,x,y);
  }
  function colours(){
    const s=getComputedStyle(canvas.parentElement);
    const resolve=(key,fallback)=>s.getPropertyValue(key).trim()||fallback;
    palette={accent:resolve('--accent','#77dfc4'),foil:resolve('--gold','#f7d17e'),rose:resolve('--secondary','#f2927b'),deep:resolve('--theme-deep','#0b1f29')};
  }
  const pins=[[309,311],[565,190],[829,307]];
  const legs=[[[116,410],[224,410],[224,346],[309,311]],[[309,311],[423,264],[477,264],[565,190]],[[565,190],[675,190],[713,234],[774,234],[829,307]]];
  function map(g,t){
    const {accent,foil,deep}=palette;
    fill('#142e33',0,0,1080,640);
    ctx.save();ctx.translate(544,270);ctx.rotate(-.28);
    for(let x=-16;x<16;x++)for(let y=-12;y<12;y++){
      const n=Math.abs(x*17+y*31)%7,px=x*58,py=y*42;
      fill(['#213c3f','#1c3639','#294546'][n%3],px,py,53,36);
      fill('#142e33',px+6+n*3,py+4,13+n,6+n);
    }
    for(let x=-700;x<700;x+=174)line('#476364',3,[[x,-530],[x,530]]);
    ctx.restore();
    polygon('#173941',[[1080,149],[990,187],[949,246],[966,287],[896,347],[895,384],[821,416],[784,480],[702,520],[678,640],[1080,640]]);
    line('#52777a',4,[[1080,149],[990,187],[949,246],[966,287],[896,347],[895,384],[821,416],[784,480],[702,520]]);
    fill('#07191fa8',0,0,1080,107);
    const stop=Math.max(0,Math.min(2,g.round-1));
    for(let i=0;i<3;i++){
      const p=pins[i],live=i===stop,done=i<stop||g.phase==='completed';
      line('#0d242c',11,legs[i]);line(live?foil:done?accent:'#91aaa3',live?5:3,legs[i],live?[]:[8,7]);
      if(live&&!reduced.matches)ring('#fff3',p[0],p[1],25+(t%1700)/65,2);
      circle('#07191f',p[0],p[1],21);ring(done?accent:live?foil:'#b1b8a9',p[0],p[1],20,3);
      text(live?foil:'#e6edda',done?'✓':String(i+1),p[0],p[1]+7,22);
      const label=['GETAWAY','THE DROP','LAST SCORE'][i];
      fill('#0a2028',p[0]-52,p[1]+27,104,23);text(done?accent:live?foil:'#dce8df',label,p[0],p[1]+43,14);
    }
    if(g.phase==='job'){
      const path=legs[stop],pos=reduced.matches ? .8 : (t%5000)/5000,index=Math.min(path.length-2,Math.floor(pos*(path.length-1))),f=pos*(path.length-1)-index;
      const [a,b]=path.slice(index,index+2);ctx.save();ctx.translate(a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f);ctx.rotate(Math.atan2(b[1]-a[1],b[0]-a[0]));
      fill('#07131b',-13,-8,26,16);fill(foil,-11,-6,22,12);fill(deep,1,-5,5,10);ctx.restore();
    }
    fill('#091c24',0,595,1080,45);
  }
  function court(g,t){
    const {foil,rose,deep}=palette;
    fill('#e8ddc3',0,0,1080,640);
    for(let y=0;y<600;y+=8)fill('#6d482206',409,y,671,1);
    polygon('#38272c',[[0,0],[396,0],[412,596],[0,596]]);
    for(let x=-22;x<385;x+=56){
      fill('#49343a',x,32,20,491);fill('#694e4a',x+2,47,4,460);
    }
    fill('#281c22',0,0,396,38);fill('#634441',0,31,396,9);fill('#453234',0,445,407,151);
    const cx=205,cy=217,ballots=g.votes||[],left=ballots[0]||0,right=ballots[1]||0;
    const angle=(right-left)/Math.max(1,left+right)*.18;
    polygon(foil,[[cx-12,338],[cx,130],[cx+12,338]]);
    fill(foil,cx-45,338,90,9);circle(foil,cx,137,10);
    const ends=[-92,92].map(v=>[cx+Math.cos(angle)*v,cy+Math.sin(angle)*v]);
    line(foil,8,ends);
    ends.forEach(([x,y],i)=>{line('#eee1bc',2,[[x-36,y+66],[x,y],[x+36,y+66]]);polygon(i?rose:'#90c0aa',[[x-38,y+65],[x+38,y+65],[x+27,y+79],[x,y+87],[x-27,y+79]]);});
    text('#f8eaca',(g.job?.title || 'Crew on trial').toUpperCase(),cx,397,23);
    text('#ded0bd',g.phase==='verdict'?'JURY IN SESSION':'HEARING THE CREW',cx,422,15);
    fill(deep,0,596,1080,44);
  }
  const rivalSprites={
    classic:['...hhh........','..hhhhhhh.....','.hhhfffhh.....','..fbbfbbf.....','..fffffff.....','...fwwff...gg.','..cccccc..gggg','.cccccccccgggg','.ccccc..c.gggg','..ccccc....gg.','..dd.dd.......','.ddd.ddd......'],
    christmas:['.....rrr......','....rrrrr.....','...rrrrrrw....','..wwwwwww.....','..fbbfbbf.....','...fffff...gg.','..rffffrr.gggg','.rrrrrrrrrgggg','.rrwrrrw..gggg','..rrrrr....gg.','..ff.ff.......','.fff.fff......'],
    spooktober:['.....hhh......','....hhhhh.....','...hhhwhhh....','..hhhhhhhhh...','..fbbfbbf.....','...fffff...gg.','..hchcch..gggg','.hhhhhhhhhgggg','..hhhhhh..gggg','.hhhhhhhh..gg.','...d..d.......','..dd..dd......'],
    vicecity:['....hhh.......','...hhhhh......','..hhhhhhh.....','..fbbfbbf.....','..fffffff.....','...fwwff...gg.','..cccccc..gggg','.cccccccccgggg','.ccccc..c.gggg','..ccccc....gg.','..dd.dd.......','.ddd.ddd......']
  };
  const chatSprite=['...hhh....','..hhhhh...','.hhhhhhh..','..fbbfff..','..ffffff..','...fff....','..cccccc..','.cccwcccf.','ffccwccc..','..ccccc...','..dd.dd...','.ddd.ddd..'];
  function sprite(grid,x,y,px,colors,flip){
    ctx.save();ctx.translate(x,y);ctx.scale(flip?-1:1,1);
    grid.forEach((row,iy)=>[...row].forEach((c,ix)=>{if(colors[c])fill(colors[c],ix*px,iy*px,px+.1,px+.1);}));ctx.restore();
  }
  function gem(x,y,s,colour){
    polygon(colour,[[x,y-s],[x+s,y],[x,y+s],[x-s,y]]);polygon('#ffffff8a',[[x,y-s],[x,y+1],[x-s,y]]);polygon('#0003',[[x,y],[x+s,y],[x,y+s]]);
  }
  function rival(g,t){
    const {accent,foil,rose,deep}=palette;
    fill(deep,0,0,1080,640);
    const sky=ctx.createLinearGradient(0,70,0,340);sky.addColorStop(0,'#19324c');sky.addColorStop(1,g.theme==='christmas'?'#829da1':'#618483');
    ctx.fillStyle=sky;ctx.fillRect(0,75,1080,285);
    circle('#ffe2ab',540,151,45);
    for(let i=0;i<31;i++){
      const x=(i*173)%1100,y=89+(i*31)%104;
      fill('#f6e4b7',x,y,i%3===0?4:2,2);
    }
    for(let i=-1;i<10;i++)polygon('#35576a',[[i*136-116,305],[i*136+30,148+(i*17)%69],[i*136+182,305]]);
    for(let i=0;i<26;i++){
      const x=i*46,top=186+(i*19)%69;
      polygon('#274a50',[[x-33,305],[x,top],[x+31,305]]);
      polygon('#315a5a',[[x-27,top+62],[x,top+8],[x,top+62]]);
    }
    // A rope bridge joins the two loot banks. The shared prize sits over the ravine.
    fill('#1c3439',0,311,1080,49);
    polygon('#283d38',[[0,290],[354,290],[374,304],[356,315],[342,315],[317,348],[300,360],[0,360]]);
    polygon('#283d38',[[1080,290],[726,290],[706,304],[724,315],[738,315],[763,348],[780,360],[1080,360]]);
    for(const start of [0,733]){
      fill('#517550',start,284,347,11);fill(g.theme==='christmas'?'#dfece2':'#a0bc72',start,282,347,4);
      for(let i=0;i<13;i++){const x=start+i*27;fill('#405448',x,306+i%3*11,15,7);fill('#344941',x+3,336+i%4*4,18,6);}
    }
    for(let i=0;i<25;i++){
      const x=342+i*16,y=282+Math.sin(i/24*Math.PI)*16;
      fill('#5c473b',x,y,14,12);fill('#b89364',x,y,14,4);
    }
    for(const x of [344,730]){fill('#654633',x-4,241,9,53);fill('#c39362',x-4,241,3,53);}
    for(const dy of [0,9]){
      ctx.beginPath();ctx.moveTo(344,246+dy);ctx.quadraticCurveTo(535,297+dy,730,246+dy);ctx.lineWidth=3;ctx.strokeStyle='#d7b684';ctx.stroke();
    }
    const scorePulse=t-changedAt<900&&!reduced.matches?Math.sin((t-changedAt)/900*Math.PI):0;
    const step=reduced.matches?0:Math.floor(t/550)%2*2;
    const colors={h:'#273440',c:rose,b:'#172b3c',d:'#263844',w:'#faf2c9',g:foil,r:'#bb4c49',f:g.theme==='christmas'?'#88c95b':'#e4ba90'};
    const scale=9,base=282;
    fill('#112a3088',185,base-3,116,6);fill('#112a3088',784,base-3,101,6);
    sprite(rivalSprites[g.theme]||rivalSprites.classic,178,base-12*scale-step,scale,colors,false);
    sprite(chatSprite,886,base-12*scale+step,scale,{...colors,h:foil,c:accent,f:'#e3bc98'},true);
    function chest(x,ink,n){
      fill('#192520',x,base-34,54,36);fill('#806544',x+3,base-29,48,26);fill('#c29859',x+3,base-25,48,5);
      fill(ink,x+6,base-30,5,25);fill(ink,x+42,base-30,5,25);fill('#ede4ac',x+23,base-23,9,10);
      for(let j=0;j<Math.min(9,n);j++)gem(x+8+(j%5)*9,base-34-Math.floor(j/5)*8,6,ink);
    }
    chest(92,rose,g.sack);chest(933,accent,g.recovered);
    const count=Math.max(1,g.sack+g.recovered),position=427+227*g.recovered/count;
    gem(position,243-scorePulse*21+(reduced.matches?0:Math.sin(t/410)*3),21+scorePulse*3,foil);
    if(g.winner)text(foil,g.winner==='chat'?'CHAT WINS':'RIVAL WINS',540,120,23);
    fill('#0c2027',0,347,1080,13);
    fill('#101a2a',0,590,1080,50);
  }
  function paint(t){
    if(!state)return;
    const theme=document.documentElement.dataset.theme||'classic';
    if(theme!==themeKey){colours();themeKey=theme;}
    const {active,game}=state;
    if(active==='rival')rival(game,t);else if(['defence','verdict'].includes(game.phase))court(game,t);else map(game,t);
  }
  function loop(t){frame=0;if(!state)return;if(t-last>=70){paint(t);last=t;}if(!reduced.matches)frame=requestAnimationFrame(loop);}
  window.AdventureStage={render(data){
    state=data;if(!state){cancelAnimationFrame(frame);frame=0;previous=null;return;}
    if(previous&&(previous.sack!==state.game.sack||previous.recovered!==state.game.recovered))changedAt=performance.now();
    previous=state.game;paint(performance.now());if(!frame&&!reduced.matches)frame=requestAnimationFrame(loop);
  }};
  new MutationObserver(()=>paint(performance.now())).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  reduced.addEventListener('change',()=>{if(state)window.AdventureStage.render(state);});
})();
