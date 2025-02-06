const { CircuitBreaker, State } = require('../../src/utils/circuitBreaker');
const metrics = require('../../src/utils/metrics');

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn((message, context) => console.log('DEBUG:', message, context)),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('CircuitBreaker', () => {
  let breaker;
  let now;

  beforeEach(() => {
    now = Date.now();
    jest.useFakeTimers({
      now,
      advanceTimers: true,
    });
    
    // Reset metrics at the start of each test
    metrics.reset();
    breaker = new CircuitBreaker({ 
      name: 'test',
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenLimit: 1,
      monitorInterval: 100,
    });
  });

  afterEach(() => {
    breaker.destroy();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('Initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.state).toBe(State.CLOSED);
      expect(breaker.failures).toBe(0);
      expect(breaker.isAllowed()).toBe(true);
    });

    it('should track creation in metrics', () => {
      expect(metrics.getValue('circuit_breaker.created', { name: 'test' })).toBe(1);
    });
  });

  describe('Success handling', () => {
    it('should handle successful operations', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const wrapped = breaker.wrap(fn);

      const result = await wrapped();
      expect(result).toBe('success');
      expect(breaker.state).toBe(State.CLOSED);
      expect(breaker.failures).toBe(0);
    });

    it('should reduce failure count on success', async () => {
      const error = new Error('test error');
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      const wrapped = breaker.wrap(fn);

      await expect(wrapped()).rejects.toThrow('test error');
      expect(breaker.failures).toBe(1);

      await wrapped();
      expect(breaker.failures).toBe(0);
    });
  });

  describe('Failure handling', () => {
    it('should track failures', async () => {
      const error = new Error('test error');
      const fn = jest.fn().mockRejectedValue(error);
      const wrapped = breaker.wrap(fn);

      for (let i = 0; i < 3; i++) {
        await expect(wrapped()).rejects.toThrow('test error');
      }

      expect(breaker.failures).toBe(3);
      expect(breaker.state).toBe(State.OPEN);
    });

    it('should reject requests when open', async () => {
      const error = new Error('test error');
      const fn = jest.fn().mockRejectedValue(error);
      const wrapped = breaker.wrap(fn);

      // Cause circuit to open
      for (let i = 0; i < 3; i++) {
        await expect(wrapped()).rejects.toThrow('test error');
      }

      // Should reject with circuit breaker error
      await expect(wrapped()).rejects.toThrow(/Circuit breaker test is OPEN/);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Recovery', () => {
    it('should attempt recovery after timeout', async () => {
      const error = new Error('test error');
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      const wrapped = breaker.wrap(fn);

      // Cause circuit to open
      for (let i = 0; i < 3; i++) {
        await expect(wrapped()).rejects.toThrow('test error');
      }
      expect(breaker.state).toBe(State.OPEN);

      // Advance time past reset timeout and run monitor interval
      jest.advanceTimersByTime(1100);
      jest.runOnlyPendingTimers();

      // Should be in half-open state
      expect(breaker.state).toBe(State.HALF_OPEN);

      // Successful request should close circuit
      const result = await wrapped();
      expect(result).toBe('success');
      expect(breaker.state).toBe(State.CLOSED);
    });

    it('should limit half-open attempts', async () => {
      const error = new Error('test error');
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      const wrapped = breaker.wrap(fn);

      // Cause circuit to open
      for (let i = 0; i < 3; i++) {
        await expect(wrapped()).rejects.toThrow('test error');
      }

      // Advance time past reset timeout and run monitor interval
      jest.advanceTimersByTime(1100);
      jest.runOnlyPendingTimers();

      // First attempt in half-open should be allowed
      expect(breaker.isAllowed()).toBe(true);

      // Second attempt should be rejected
      expect(breaker.isAllowed()).toBe(false);
    });
  });

  describe('Metrics', () => {
    let breaker;
    let fn;

    beforeEach(() => {
      breaker = new CircuitBreaker('test', { failureThreshold: 2 });
      fn = jest.fn();
    });

    it('should track attempts and results', async () => {
      // First call - success
      fn.mockResolvedValueOnce('success');
      const wrapped = breaker.wrap(fn);
      await wrapped();

      expect(metrics.getValue('circuit_breaker.attempt', { name: 'test' })).toBe(1);
      expect(metrics.getValue('circuit_breaker.success', { name: 'test' })).toBe(1);
      expect(metrics.getValue('circuit_breaker.failure', { name: 'test' })).toBe(0);
      expect(metrics.getValue('circuit_breaker.rejected', { name: 'test' })).toBe(0);

      // Second call - failure
      fn.mockRejectedValueOnce(new Error('error'));
      await expect(wrapped()).rejects.toThrow('error');
      expect(metrics.getValue('circuit_breaker.attempt', { name: 'test' })).toBe(2);
      expect(metrics.getValue('circuit_breaker.failure', { name: 'test' })).toBe(1);
      expect(metrics.getValue('circuit_breaker.rejected', { name: 'test' })).toBe(0);

      // Third call - failure and state change
      fn.mockRejectedValueOnce(new Error('error'));
      await expect(wrapped()).rejects.toThrow('error');
      expect(metrics.getValue('circuit_breaker.attempt', { name: 'test' })).toBe(3);
      expect(metrics.getValue('circuit_breaker.failure', { name: 'test' })).toBe(2);
      expect(metrics.getValue('circuit_breaker.rejected', { name: 'test' })).toBe(0);
      expect(metrics.getValue('circuit_breaker.state_change', { name: 'test' })).toBe(1);
    });

    it('should track state changes', async () => {
      const error = new Error('test error');
      const fn = jest.fn()
        .mockRejectedValue(error);
      const wrapped = breaker.wrap(fn);

      // Initial state is CLOSED
      expect(breaker.state).toBe(State.CLOSED);

      // Cause circuit to open
      for (let i = 0; i < 3; i++) {
        await expect(wrapped()).rejects.toThrow('test error');
      }

      // Should be OPEN now
      expect(breaker.state).toBe(State.OPEN);
      expect(metrics.getValue('circuit_breaker.state_change', { name: 'test' })).toBe(1);

      // Advance time past reset timeout and run monitor interval
      jest.advanceTimersByTime(1100);
      jest.runOnlyPendingTimers();

      // Should be HALF_OPEN now
      expect(breaker.state).toBe(State.HALF_OPEN);
      expect(metrics.getValue('circuit_breaker.state_change', { name: 'test' })).toBe(2);
    });
  });

  describe('State reporting', () => {
    it('should report current state', async () => {
      const error = new Error('test error');
      const fn = jest.fn().mockRejectedValue(error);
      const wrapped = breaker.wrap(fn);

      // Cause circuit to open
      for (let i = 0; i < 3; i++) {
        await expect(wrapped()).rejects.toThrow('test error');
      }

      const state = breaker.getState();
      expect(state).toEqual(expect.objectContaining({
        name: 'test',
        state: State.OPEN,
        failures: 3,
        lastFailureTime: expect.any(Number),
        halfOpenAttempts: 0,
        metrics: expect.any(Object),
      }));
    });
  });

  describe('metrics tracking', () => {
    let fn;

    beforeEach(() => {
      fn = jest.fn();
    });

    it('should track attempts and results', async () => {
      fn.mockResolvedValueOnce('success');
      const wrapped = breaker.wrap(fn);
      await wrapped();

      expect(metrics.getValue('circuit_breaker.attempt', { name: 'test' })).toBe(1);
      expect(metrics.getValue('circuit_breaker.success', { name: 'test' })).toBe(1);
      expect(metrics.getValue('circuit_breaker.failure', { name: 'test' })).toBe(0);
      expect(metrics.getValue('circuit_breaker.rejected', { name: 'test' })).toBe(0);
    });

    it('should track state changes', async () => {
      fn.mockRejectedValue(new Error('test error'));
      const wrapped = breaker.wrap(fn);

      try { await wrapped(); } catch (e) {}
      try { await wrapped(); } catch (e) {}

      expect(metrics.getValue('circuit_breaker.state_change', { name: 'test' })).toBe(1);
    });
  });
}); 