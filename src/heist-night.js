'use strict';

const JOBS = [
  {
    title:'The Getaway Car',reward:100,
    options:['Clean getaway','First car you see','Let the GPS decide'],
    challenges:[
      'Collect a getaway car in GTA and deliver it to your waypoint without drawing a weapon.',
      'The first drivable car you see in GTA is your getaway car. Reach the meeting point in it.',
      'Pick your getaway car, set an in-game waypoint and stick to the route the minimap gives you.'
    ]
  },
  {
    title:'The Drop',reward:150,
    options:['Mint condition','No minimap','Strictly first person'],
    challenges:[
      'Deliver the getaway car to the next GTA map marker without adding a dent.',
      'Hide the GTA minimap for this delivery. Find the drop using street signs and landmarks.',
      'Make the entire in-game delivery in first-person camera, including the parking job.'
    ]
  },
  {
    title:'The Crew�s Last Score',reward:200,
    options:['One life','Borrowed wheels','The chat chauffeur'],
    challenges:[
      'Complete your next GTA mission objective without an in-game death or restart.',
      'Complete the next in-game objective using the least glamorous vehicle you can find.',
      'At the next three GTA junctions, follow the turn directions chat calls out. Then finish the objective.'
    ]
  }
];
const FINALE='Finish one more GTA mission objective on your first attempt. An in-game death or mission restart costs the crew its pot.';
const COURT_FINE = 50;
const PHASE_ACTIONS = {
  'job-vote': [['next','Close rule vote']],
  job: [['success','Mark job complete'],['failure','Send to Chat Court']],
  defence: [['next','Open verdict vote']],
  verdict: [['next','Close verdict vote']],
  'finale-vote': [['next','Close finale vote']],
  risk: [['success','Final challenge passed'],['failure','Final challenge missed']]
};

function cleanDefence(text) {
  return Array.from(text.replace(/[\p{Cc}\p{Bidi_Control}]/gu,' ').replace(/\s+/g,' ').trim()).slice(0,140).join('');
}

class HeistNight {
  constructor({publish=()=>{},schedule=setTimeout,cancel=clearTimeout,now=Date.now}={}) {
    this.publish=publish;
    this.schedule=schedule;
    this.cancel=cancel;
    this.now=now;
    this.generation=0;
    this.candidateId=0;
    this.timer=null;
    this.reset();
  }

  reset() {
    this.phase='idle';
    this.round=0;
    this.pot=0;
    this.banked=0;
    this.job=null;
    this.title='Heist Night';
    this.prompt='';
    this.result=null;
    this.consequence=null;
    this.selectedDefence=null;
    this.endsAt=null;
    this.options=[];
    this.votes=[];
    this.ballots=new Set();
    this.defences=new Map();
  }

  start({seconds=20}={}) {
    if(this.phase!=='idle') throw Error('Take the current Heist Night off the overlay first.');
    if(!Number.isInteger(Number(seconds)) || seconds==='' || Number(seconds)<10 || Number(seconds)>60)
      throw Error('Voting time must be a whole number from 10 to 60 seconds.');
    this.seconds=Number(seconds);
    this.pot=100;
    this.beginJobVote();
    return this.emit();
  }

  stop() {
    this.disarm();
    this.reset();
    return this.emit();
  }

  disarm() {
    this.generation++;
    if(this.timer!==null) this.cancel(this.timer);
    this.timer=null;
  }

  enter(phase,title,prompt,options=[],timed=false) {
    this.disarm();
    this.phase=phase;
    this.title=title;
    this.prompt=prompt;
    this.options=options;
    this.votes=options.map(()=>0);
    this.ballots.clear();
    this.defences.clear();
    this.endsAt=timed?this.now()+this.seconds*1000:null;
    if(timed) {
      const generation=this.generation;
      this.timer=this.schedule(()=>{
        if(generation===this.generation) this.act('next');
      },this.seconds*1000);
      this.timer?.unref?.();
    }
  }

  beginJobVote() {
    this.round++;
    this.selectedDefence=null;
    const job=JOBS[this.round-1];
    this.job={title:job.title,challenge:null,reward:job.reward};
    this.enter('job-vote',job.title,'Choose the in-game rule. Vote 1, 2 or 3 in chat.',job.options,true);
  }

  advanceJob() {
    this.selectedDefence=null;
    if(this.round<JOBS.length) this.beginJobVote();
    else this.enter('finale-vote','Bank or risk?','Vote 1 to keep the pot or 2 to play a final in-game challenge for double.',['Bank','Risk'],true);
  }

  finish(amount,message) {
    this.banked=amount;
    this.result=message;
    this.enter('completed','Heist complete',message);
  }

  closePhase() {
    // Listed order settles ties, so an empty or tied finale always banks the pot.
    const winner=this.votes.length?this.votes.indexOf(Math.max(...this.votes)):0;
    if(this.phase==='job-vote') {
      const job=JOBS[this.round-1];
      this.job={title:job.title,challenge:job.challenges[winner],reward:job.reward};
      this.enter('job',job.options[winner],this.job.challenge);
    } else if(this.phase==='defence') {
      this.enter('verdict','Chat Court','Vote 1 to pardon or 2 to fine the crew 50 points and sentence the driver to sports commentary.',['Pardon','Fine 50'],true);
    } else if(this.phase==='verdict') {
      const fine=winner===1?Math.min(this.pot,COURT_FINE):0;
      this.pot-=fine;
      this.consequence=winner===1?'Court fine: '+fine+' points. Narrate your next minute of gameplay like a sports commentator.':'Pardoned. The crew keeps its pot.';
      this.advanceJob();
    } else if(this.phase==='finale-vote') {
      if(winner===0) this.finish(this.pot,'The crew banked '+this.pot+' points.');
      else this.enter('risk','Double or nothing',FINALE);
    } else throw Error('There is no open vote or defence period.');
  }

  act(action,payload={}) {
    if(action==='next') this.closePhase();
    else if(action==='select-defence' && this.phase==='defence') {
      if(this.now()>=this.endsAt) { this.closePhase(); this.emit(); throw Error('The defence period has closed.'); }
      const id=typeof payload==='string'?payload:payload?.defenceId;
      const chosen=[...this.defences.values()].find(entry=>entry.id===id);
      if(!chosen) throw Error('That defence is unavailable.');
      this.selectedDefence=chosen.text;
    } else if((action==='success' || action==='failure') && this.phase==='job') {
      this.consequence=null;
      if(action==='success') {
        this.pot+=this.job.reward;
        this.result='Job complete. Added '+this.job.reward+' points.';
        this.advanceJob();
      } else {
        this.result='Job missed. Chat Court is in session.';
        this.enter('defence','Chat Court','Submit a defence with !defend followed by one short line.',[],true);
      }
    } else if((action==='success' || action==='failure') && this.phase==='risk') {
      const won=action==='success';
      this.finish(won?this.pot*2:0,won?'The crew doubled its pot to '+this.pot*2+' points.':'The final challenge was missed. The crew banked 0 points.');
    } else throw Error('That action is unavailable in this phase.');
    return this.emit();
  }

  chat(event) {
    if(this.endsAt===null) return false;
    if(this.now()>=this.endsAt) { this.closePhase();this.emit();return false; }
    const identity=event?.user?.id||event?.user?.username;
    if(!identity || !event.platform) return false;
    const key=JSON.stringify([String(event.platform).toLowerCase(),String(identity)]);
    const text=String(event.text||'').trim();
    if(this.phase==='defence') {
      const match=/^!defend\s+(.+)$/is.exec(text);
      if(!match) return false;
      const line=cleanDefence(match[1]);
      if(!line) return false;
      if(this.defences.has(key) || this.defences.size>=30) return true;
      this.defences.set(key,{id:String(++this.candidateId),text:line});
    } else {
      const match=/^(?:!vote\s+)?([1-3])$/i.exec(text);
      if(!match || Number(match[1])>this.options.length) return false;
      if(this.ballots.has(key) || this.ballots.size>=2000) return true;
      this.ballots.add(key);
      this.votes[Number(match[1])-1]++;
    }
    this.emit();
    return true;
  }

  emit() {
    const state=this.getState();
    this.publish(state);
    return state;
  }

  getState() {
    const actions=(PHASE_ACTIONS[this.phase]||[]).map(([id,label])=>({id,label}));
    return {phase:this.phase,title:this.title,prompt:this.prompt,options:[...this.options],votes:[...this.votes],
      endsAt:this.endsAt,actions,round:this.round,rounds:JOBS.length,pot:this.pot,banked:this.banked,
      job:this.job?{...this.job}:null,selectedDefence:this.selectedDefence,consequence:this.consequence,result:this.result};
  }

  getHostState() {
    return {...this.getState(),defenceCandidates:[...this.defences.values()].map(entry=>({...entry}))};
  }
}

module.exports={HeistNight};
