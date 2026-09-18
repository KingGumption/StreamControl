function streamEvents(req, res, { name, subscribe, initial }) {
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',Connection:'keep-alive'});
  res.flushHeaders();
  let closed = false;
  const write = chunk => {
    if (closed) return;
    // A single large roster can exceed Node's high-water mark on a healthy
    // connection. Limit actual queued bytes instead of treating false as failure.
    if ((res.writableLength || 0) + Buffer.byteLength(chunk) > 1024 * 1024) {
      res.destroy();
      return;
    }
    res.write(chunk);
  };
  const send = value => {
    if (closed) return;
    write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
  };
  const unsubscribe = subscribe(send);
  if (initial) send(initial()); else write(': connected\n\n');
  const heartbeat = setInterval(() => write(': keep-alive\n\n'),15000);
  heartbeat.unref?.();
  res.on('close', () => { closed = true; clearInterval(heartbeat); unsubscribe(); });
}
module.exports = { streamEvents };
