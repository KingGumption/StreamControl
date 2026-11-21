const WebSocket = require('ws');
const {randomUUID}=require('node:crypto');
const {streamerBotAuthentication}=require('./streamerbot-auth');
const OBSWebSocket = require('obs-websocket-js').default;
const { WebSocketConnectionMonitor } = require('./connection-status');
const { loadPolaroidConfig } = require('./polaroid/config');

class ConnectorRuntime {
  constructor({ config, WebSocketImpl = WebSocket, obs = new OBSWebSocket(), reconnectDelayMs = 5000 } = {}) {
    this.config = config;
    this.WebSocketImpl = WebSocketImpl;
    this.obs = obs;
    this.reconnectDelayMs = reconnectDelayMs;
    this.cloud = null;
    this.cloudTimer = null;
    this.started = false;
    this.streamerBotSocket = null;
    this.localAuthReady = false;
    this.localAuthId = null;
    this.localAuthTimer = null;
    this.tikfinitySocket = null;
    this.obsConnected = false;
    this.obsConnectPromise = null;
    this.localMonitors = [];
    this.outbox = [];
    this.outboxBytes = 0;
    this.flushTimer = null;
    this.localPolaroidConfig = loadPolaroidConfig();
    this.registry = { update() {}, markConnected() {}, markEvent() {} };
    this.obs.on('ConnectionClosed', () => {
      this.obsConnected = false;
      this.send({ type: 'service.state', service: 'obs', connected: false, detail: 'OBS disconnected' });
    });
    this.obs.on('StreamStateChanged', (data) => this.send({ type: 'obs.event', event: 'StreamStateChanged', data }));
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.startLocalServices();
    this.connectCloud();
  }

  startLocalServices() {
    if (this.localMonitors.length) return;
    this.localMonitors = [
      new WebSocketConnectionMonitor({
        service: 'streamerbot', url: this.config.streamerBot.websocketUrl, registry: this.registry,
        reconnectDelayMs: this.reconnectDelayMs, WebSocketImpl: this.WebSocketImpl,
        onOpen: socket=>this.openStreamerBot(socket),
        onMessage: (payload,socket)=>this.handleStreamerBot(payload,socket),
        onClose: ()=>{this.clearLocalAuth();this.streamerBotSocket=null;this.sendServiceState('streamerbot',false,'Disconnected');},
      }),
      new WebSocketConnectionMonitor({
        service: 'tikfinity', url: this.config.tikfinity.websocketUrl, registry: this.registry,
        reconnectDelayMs: this.reconnectDelayMs, WebSocketImpl: this.WebSocketImpl,
        onOpen: (socket) => { this.tikfinitySocket = socket; this.sendServiceState('tikfinity', true, 'Connected'); },
        onMessage: (payload) => this.send({ type: 'service.message', service: 'tikfinity', payload: bufferText(payload) }),
        onClose: () => { this.tikfinitySocket = null; this.sendServiceState('tikfinity', false, 'Disconnected'); },
      }),
    ];
    this.localMonitors.forEach((monitor) => monitor.start());
  }

  clearLocalAuth() {
    clearTimeout(this.localAuthTimer);this.localAuthTimer=null;
    this.localAuthReady=false;this.localAuthId=null;
  }

  openStreamerBot(socket) {
    this.clearLocalAuth();
    this.streamerBotSocket=socket;
    if(!this.config.streamerBot.password){this.sendServiceState('streamerbot',true,'Connected');return;}
    this.sendServiceState('streamerbot',false,'Waiting for local Streamer.bot authentication');
    this.watchLocalAuth(socket);
  }

  watchLocalAuth(socket) {
    clearTimeout(this.localAuthTimer);
    this.localAuthTimer=setTimeout(()=>{
      if(socket!==this.streamerBotSocket||this.localAuthReady)return;
      this.clearLocalAuth();
      this.sendServiceState('streamerbot',false,'Timed out waiting for local Streamer.bot authentication');
      // Reconnect with a fresh socket and challenge; an old acknowledgement cannot unlock it.
      socket.close();
    },10000);
    this.localAuthTimer.unref?.();
  }

  handleStreamerBot(raw,socket) {
    if(socket!==this.streamerBotSocket||!socket)return;
    const password=this.config.streamerBot.password;
    if(!password){this.send({type:'service.message',service:'streamerbot',payload:bufferText(raw)});return;}
    let p;try{p=JSON.parse(bufferText(raw));}catch{return;}
    if(!p||typeof p!=='object')return;
    if(p.request==='Hello'){
      this.clearLocalAuth();
      const auth=p.authentication;
      if(typeof auth?.salt!=='string'||!auth.salt||typeof auth.challenge!=='string'||!auth.challenge){
        this.sendServiceState('streamerbot',false,'Local WebSocket authentication is configured but Streamer.bot did not offer a challenge');
        return;
      }
      this.sendServiceState('streamerbot',false,'Authenticating with Streamer.bot locally');
      this.localAuthId='pc-streamerbot-auth:'+randomUUID();
      this.watchLocalAuth(socket);
      socket.send(JSON.stringify({request:'Authenticate',id:this.localAuthId,authentication:streamerBotAuthentication(password,auth)}));
      return;
    }
    if(typeof p.id==='string'&&p.id.startsWith('pc-streamerbot-auth:')){
      if(p.id!==this.localAuthId)return;
      this.clearLocalAuth();
      if(p.status==='ok'){
        this.localAuthReady=true;
        this.send({type:'service.state',service:'streamerbot',connected:true,authenticatedLocally:true,detail:'Authenticated by local connector'});
      }else{this.sendServiceState('streamerbot',false,'Streamer.bot rejected local WebSocket authentication; check the connector password');}
      return;
    }
    // No unauthenticated events or authentication exchange may enter the bridge or replay backlog.
    if(this.localAuthReady)this.send({type:'service.message',service:'streamerbot',payload:bufferText(raw)});
  }

  reconnectLocalServices() {
    this.clearLocalAuth();
    this.localMonitors.forEach((monitor) => monitor.stop());
    this.localMonitors = [];
    this.streamerBotSocket = null;
    this.tikfinitySocket = null;
    this.startLocalServices();
  }

  connectCloud() {
    if (!this.started || this.cloud) return;
    let socket;
    try {
      socket = new this.WebSocketImpl(this.config.bridge.cloudUrl, {
        headers: { Authorization: `Bearer ${this.config.bridge.token}` },
        maxPayload: 32 * 1024 * 1024,
      });
    } catch { this.scheduleCloudReconnect(); return; }
    this.cloud = socket;
    socket.on('open', () => {
      console.log(`[Connector] Connected to ${this.config.bridge.cloudUrl}`);
      this.send({ type: 'connector.hello', version: 1 });
      void this.reportSpotifyApp(socket);
      clearInterval(this.spotifyStatusTimer);
      this.spotifyStatusTimer=setInterval(()=>this.reportSpotifyApp(socket),10000);
      this.spotifyStatusTimer.unref();
      this.flushOutbox();
      this.reconnectLocalServices();
      this.sendServiceState('obs', this.obsConnected, this.obsConnected ? 'Connected' : 'Not connected');
    });
    socket.on('message', (raw) => this.handleCloudMessage(raw));
    socket.on('error', (error) => console.warn('[Connector] Cloud connection:', safeMessage(error)));
    socket.on('close', () => {
      if (this.cloud === socket) {clearInterval(this.spotifyStatusTimer);this.cloud = null;}
      if (this.started) this.scheduleCloudReconnect();
    });
  }

  scheduleCloudReconnect() {
    if (!this.started || this.cloudTimer) return;
    this.cloudTimer = setTimeout(() => { this.cloudTimer = null; this.connectCloud(); }, this.reconnectDelayMs);
    // This is a standalone process, unlike the HTTP server. Keep its retry
    // alive when cloud and local sockets are all down; stop() releases it.
  }

  async reportSpotifyApp(socket){
    const state=await require('./spotify-desktop').status();
    if(this.cloud===socket)this.send({type:'spotify.desktop.state',state});
  }

  handleCloudMessage(raw) {
    let message;
    try { message = JSON.parse(bufferText(raw)); } catch { return; }
    if (message.type === 'service.send') {
      if(message.service==='streamerbot'&&this.config.streamerBot.password){
        if(!this.localAuthReady)return;
        let command;try{command=JSON.parse(message.payload);}catch{return;}
        if(command?.request==='Authenticate')return;
      }
      const socket = message.service === 'streamerbot' ? this.streamerBotSocket : message.service === 'tikfinity' ? this.tikfinitySocket : null;
      if (socket?.readyState === WebSocket.OPEN) socket.send(String(message.payload));
      return;
    }
    if(message.type==='spotify.desktop.launch'){
      const socket=this.cloud;
      this.launchSpotifyWhileLive().then(data=>{
        if(this.cloud===socket)this.send({type:'spotify.desktop.response',id:message.id,ok:true,data});
      }).catch(()=>{
        if(this.cloud===socket)this.send({type:'spotify.desktop.response',id:message.id,ok:false,error:'Windows could not open Spotify on the stream PC.'});
      });
      return;
    }
    if (message.type === 'obs.request') void this.handleObsRequest(message);
  }

  async launchSpotifyWhileLive(){
    await this.ensureObsConnected();
    const status=await this.obs.call('GetStreamStatus');
    if(status?.outputActive!==true||status.outputReconnecting===true)throw Error('OBS is offline');
    return require('./spotify-desktop').launch();
  }

  async handleObsRequest(message) {
    try {
      let data;
      if (message.method === 'connect') data = await this.ensureObsConnected();
      else if (message.method === 'CapturePolaroid') {
        await this.ensureObsConnected();
        if(message.args?.ownerTest!==true){const status=await this.obs.call('GetStreamStatus');if(status?.outputActive!==true||status.outputReconnecting===true)throw Error('Polaroid blocked: OBS is not live.');}
        data=await this.obs.call('GetSourceScreenshot',message.args?.screenshot||{});
      }
      else if (message.method === 'disconnect') {
        await this.obs.disconnect();
        this.obsConnected = false;
        data = {};
      } else {
        await this.ensureObsConnected();
        data = await this.obs.call(message.method, message.args || {});
      }
      this.send({ type: 'obs.response', id: message.id, ok: true, data: data || {} });
    } catch (error) {
      this.send({ type: 'obs.response', id: message.id, ok: false, error: safeMessage(error) });
    }
  }

  async ensureObsConnected() {
    if (this.obsConnected) return {};
    if (this.obsConnectPromise) return this.obsConnectPromise;
    this.obsConnectPromise = this.obs.connect(
      this.localPolaroidConfig.obs.url,
      this.localPolaroidConfig.obs.password || undefined,
      { rpcVersion: 1 },
    ).then((result) => {
      this.obsConnected = true;
      this.sendServiceState('obs', true, 'Connected');
      return result || {};
    }).finally(() => { this.obsConnectPromise = null; });
    return this.obsConnectPromise;
  }

  sendServiceState(service, connected, detail) {
    this.send({ type: 'service.state', service, connected, detail });
  }

  send(message) {
    if (!this.cloud || this.cloud.readyState !== WebSocket.OPEN || this.cloud.bufferedAmount > 2 * 1024 * 1024) {
      if (['service.message', 'obs.event'].includes(message?.type)) {
        const replay = {...message, replayed:true, receivedAt:message.receivedAt || new Date().toISOString()};
        const bytes = Buffer.byteLength(JSON.stringify(replay));
        if (bytes <= 4*1024*1024) {
          this.outbox.push({message:replay,bytes}); this.outboxBytes += bytes;
          while(this.outbox.length > 1000 || this.outboxBytes > 4*1024*1024) this.outboxBytes -= this.outbox.shift().bytes;
        }
        this.scheduleFlush();
      }
      return false;
    }
    try { this.cloud.send(JSON.stringify(message)); return true; } catch { return false; }
  }

  flushOutbox() {
    while(this.outbox.length && this.cloud?.readyState === WebSocket.OPEN && !(this.cloud.bufferedAmount>2*1024*1024)) {
      const {message,bytes}=this.outbox.shift(); this.outboxBytes-=bytes;
      if(Date.now()-Date.parse(message.receivedAt)>15*60000)continue;
      this.send(message);
    }
    if(this.outbox.length)this.scheduleFlush();
  }

  scheduleFlush() {
    if(this.flushTimer || !this.started)return;
    this.flushTimer=setTimeout(()=>{this.flushTimer=null;this.flushOutbox();},250);this.flushTimer.unref?.();
  }

  async stop() {
    this.clearLocalAuth();this.streamerBotSocket=null;
    clearTimeout(this.flushTimer);this.flushTimer=null;
    this.started = false;
    clearInterval(this.spotifyStatusTimer);
    if (this.cloudTimer) clearTimeout(this.cloudTimer);
    this.cloudTimer = null;
    this.localMonitors.forEach((monitor) => monitor.stop());
    this.localMonitors = [];
    this.cloud?.close(1000, 'Connector stopping');
    this.cloud = null;
    try { await this.obs.disconnect(); } catch { /* Already disconnected. */ }
  }
}

function bufferText(value) { return Buffer.isBuffer(value) ? value.toString('utf8') : String(value); }
function safeMessage(error) { return String(error?.message || error || 'Unknown error').replace(/[\r\n]+/g, ' ').slice(0, 300); }

module.exports = { ConnectorRuntime };
