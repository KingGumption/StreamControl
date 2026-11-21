const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const os=require('node:os');
const path=require('node:path');
const exec=promisify(execFile);
const system32=path.join(process.env.SystemRoot||'C:\\Windows','System32');
async function status(){
  if(process.platform!=='win32')return 'unknown';
  try{
    const {stdout}=await exec(path.join(system32,'tasklist.exe'),['/FI','IMAGENAME eq Spotify.exe','/FO','CSV','/NH'],{windowsHide:true,timeout:5000});
    return /^"Spotify\.exe",/im.test(stdout)?'connected':'disconnected';
  }catch{return 'unknown'}
}
async function launch(skipIfRunning=false){
  if(skipIfRunning){
    const state=await status();
    if(state==='connected')return {alreadyRunning:true};
    if(state!=='disconnected')throw Error('Could not confirm Spotify desktop status.');
  }
  if(process.platform!=='win32')throw Error('Spotify desktop launch requires the Windows stream PC.');
  // The command and URI are fixed. No browser or bridge input enters the Windows shell.
  await exec(path.join(system32,'WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',"Start-Process -FilePath 'spotify:' -ErrorAction Stop"],{windowsHide:true,timeout:8000});
  return {deviceName:process.env.SPOTIFY_STREAM_DEVICE_NAME||os.hostname()};
}
module.exports={status,launch};
