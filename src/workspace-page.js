const fs=require('node:fs');
const path=require('node:path');
const templates=new Map();
module.exports=function workspacePage(res,filename){
  if(!templates.has(filename)) templates.set(filename,fs.readFileSync(path.join(__dirname,'../public',filename),'utf8'));
  const user=res.req.identity;
  const attributes=user.role==='owner'?'':` data-sections="${user.sections.join(' ')}"`;
  const html=templates.get(filename).replace('<body','<body'+attributes);
  return res.set('Cache-Control','private, no-store').type('html').send(html);
};
