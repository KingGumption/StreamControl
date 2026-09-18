class WorkQueue {
  constructor({ concurrency = 1, limit = 64 } = {}) {
    this.concurrency = concurrency; this.limit = limit; this.active = 0; this.jobs = []; this.waiters = [];
  }
  add(work) {
    if (this.jobs.length >= this.limit) return Promise.reject(new Error('Background queue is full'));
    return new Promise((resolve, reject) => { this.jobs.push({work,resolve,reject}); this.drain(); });
  }
  drain() {
    while (this.active < this.concurrency && this.jobs.length) {
      const job = this.jobs.shift(); this.active++;
      Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(() => {
        this.active--; this.drain();
        if (!this.active && !this.jobs.length) this.waiters.splice(0).forEach(resolve => resolve());
      });
    }
  }
  idle() { return this.active || this.jobs.length ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve(); }
  get size() { return this.active + this.jobs.length; }
}
module.exports = { WorkQueue };
