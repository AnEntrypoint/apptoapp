const metrics = {
  counters: new Map(),
  timers: new Map(),

  increment(key, value = 1) {
    if (!this.counters.has(key)) {
      this.counters.set(key, 0);
    }
    this.counters.set(key, this.counters.get(key) + value);
  },

  startTimer(key) {
    if (!this.timers.has(key)) {
      this.timers.set(key, []);
    }
    this.timers.get(key).push(Date.now());
  },

  stopTimer(key) {
    if (!this.timers.has(key)) {
      throw new Error(`Timer ${key} does not exist`);
    }
    const startTime = this.timers.get(key).pop();
    if (startTime === undefined) {
      throw new Error(`Timer ${key} has no start time`);
    }
    const duration = Date.now() - startTime;
    this.increment(`${key}_duration`, duration);
  },

  getValue(key) {
    return this.counters.get(key) || 0;
  },

  getTimerValue(key) {
    return this.getValue(`${key}_duration`);
  },

  reset() {
    this.counters.clear();
    this.timers.clear();
  }
};

module.exports = metrics;
