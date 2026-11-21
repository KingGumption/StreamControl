// Run from a repository checkout. Prints paths and finding types only, never matched credentials.
const {execFileSync}=require('node:child_process');
const {readFileSync,statSync}=require('node:fs');
const findings=[];
const rules=[
 ['private key',/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
 ['provider credential',/(?:gh[pousr]_[a-z\d]{30,}|github_pat_[\w]{45,}|sk-(?:proj-)?[\w-]{32,}|AKIA[A-Z0-9]{16}|https:\/\/(?:canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]{30,})/i],
 ['Windows user profile path',/(?:[a-z]:[\\/]+users[\\/]+|file:\/\/\/[a-z](?:%3a|:)\/users\/)[a-z\d._-]+[\\/]/i],
];
for(const f of execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)){
 if(/(?:^|\/)(?:\.env(?:$|\.(?!.*example$))|[^/]+\.(?:pfx|pem|key|p12|sqlite3?|db)(?:$|-))/.test(f)){findings.push([f,'runtime/credential file']);continue}
 if(!/\.(?:[cm]?js|html?|css|json|ya?ml|md|ps1|sh|ts|txt|py|cmd|example)$/i.test(f)||!statSync(f).isFile())continue;
 const s=readFileSync(f,'utf8');for(const [type,pattern] of rules)if(pattern.test(s))findings.push([f,type]);
}
for(const [f,t] of findings)console.error(t+': '+f);
if(findings.length)process.exitCode=1;else console.log('No recognised credential files, provider keys, or Windows user profile paths in tracked source.');
