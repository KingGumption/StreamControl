const { EventEmitter } = require('node:events');

class RemoteObsClient extends EventEmitter {
  constructor(bridge) {
    super();
    this.bridge = bridge;
    this.handleEvent = (event, data) => this.emit(event, data);
    this.handleDisconnect = () => this.emit('ConnectionClosed');
    bridge.on('obs-event', this.handleEvent);
    bridge.on('connector-disconnected', this.handleDisconnect);
  }

  connect() { return this.bridge.requestObs('connect'); }
  call(method, args = {}) { return this.bridge.requestObs(method, args); }
  disconnect() { return this.bridge.connected ? this.bridge.requestObs('disconnect').catch(() => {}) : Promise.resolve(); }
}

module.exports = { RemoteObsClient };
