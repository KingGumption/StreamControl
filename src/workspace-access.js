const sections = {
  home: {label:'Dashboard', page:'/dashboard', reads:['/dashboard/state']},
  songs: {label:'Song requests', page:'/', reads:['/ui','/stream-engagement','/config','/requests','/connections','/spotify/launch-status']},
  games: {label:'Games', page:'/games', reads:['/games/quick','/games/state','/games/connections','/quiz','/quiz/state','/king-of-the-hill','/king-of-the-hill/state']},
  graphics: {label:'Graphics', page:'/graphics', reads:['/graphics/catalog','/graphics/spotify-availability']},
  polaroid: {label:'Polaroid', page:'/polaroid', reads:['/polaroid/status','/polaroid/latest','/polaroid/control.js']},
  analytics: {label:'Analytics', page:'/analytics', reads:['/analytics/summary','/analytics/activity','/analytics/growth-notes']},
  coach: {label:'Content Coach', page:'/content-coach', reads:['/content-coach/data','/content-coach/analysis',...['instagram','youtube','tiktok'].map(p=>'/content-coach/'+p+'/status')]}
};
function canRead(user,path){
  if(user.role==='owner')return true;
  if(path==='/games/session'||path==='/workspace'||path==='/workspace/connections')return true;
  return user.sections.some(key=>{
    const group=sections[key];
    return group.page===path || group.reads.includes(path) ||
      (key==='graphics' && /^\/graphics\/(url|preview)\/(banner|bannerPlain|card|cardVertical|counter)$/.test(path));
  });
}
function landing(user){
  if(user.role==='owner')return '/admin/dashboard';
  const section=Object.keys(sections).find(k=>user.sections.includes(k));
  return section?'/admin'+sections[section].page:'/admin/workspace';
}
module.exports={sections,canRead,landing};
