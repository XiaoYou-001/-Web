export class FakeTimers {
  now = 0;
  nextId = 1;
  jobs = new Map();
  setTimeout = (callback, delay) => this.add(callback, delay, false);
  setInterval = (callback, delay) => this.add(callback, delay, true);
  clearTimeout = id => this.jobs.delete(id);
  clearInterval = id => this.jobs.delete(id);
  add(callback, delay, repeat) {
    const id = this.nextId++;
    this.jobs.set(id, { callback, delay, repeat, at: this.now + delay });
    return id;
  }
  advance(duration) {
    const end = this.now + duration;
    for (;;) {
      const next = [...this.jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, job] = next;
      this.now = job.at;
      if (job.repeat) job.at += job.delay;
      else this.jobs.delete(id);
      job.callback();
    }
    this.now = end;
  }
}

export class FakeSocket {
  readyState = 0;
  sent = [];
  constructor(url) { this.url = new URL(url); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
  fail() { this.onerror?.(); }
  send(raw) {
    if (this.readyState !== 1 || this.failSend) throw new Error('Socket unavailable');
    this.sent.push(JSON.parse(raw));
  }
  close() { this.readyState = 3; }
}
