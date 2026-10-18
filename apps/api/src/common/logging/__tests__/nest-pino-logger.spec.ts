import { describe, expect, it, jest } from '@jest/globals';

import { NestPinoLogger } from '../logger';

/**
 * SC-014 names "request identifier handling" a critical path, and NestPinoLogger is the
 * adapter that makes Nest's own logging framework output flow through the redaction list.
 * If it renders a message badly, secrets reach the log.
 *
 * These tests pin the rendering contract: every Nest log level reaches the right pino
 * level, and `messageString` never turns a thrown value into an object graph dump.
 */

function captureLogger(): { adapter: NestPinoLogger; sink: Record<string, jest.Mock> } {
  const sink = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  };
  return { adapter: new NestPinoLogger(sink as never), sink };
}

describe('NestPinoLogger maps every Nest level onto pino (request identifier handling)', () => {
  it('sends each level to the corresponding pino level', () => {
    const { adapter, sink } = captureLogger();

    adapter.log('m', 'Ctx');
    adapter.warn('m', 'Ctx');
    adapter.debug('m', 'Ctx');
    adapter.verbose('m', 'Ctx');
    adapter.fatal('m', 'Ctx');
    adapter.error('m', 'stack-here', 'Ctx');

    expect(sink.info).toHaveBeenCalledWith({ context: 'Ctx' }, 'm');
    expect(sink.warn).toHaveBeenCalledWith({ context: 'Ctx' }, 'm');
    expect(sink.debug).toHaveBeenCalledWith({ context: 'Ctx' }, 'm');
    // Nest's `verbose` is pino's `trace`; they are the same level under two names.
    expect(sink.trace).toHaveBeenCalledWith({ context: 'Ctx' }, 'm');
    expect(sink.fatal).toHaveBeenCalledWith({ context: 'Ctx' }, 'm');
    expect(sink.error).toHaveBeenCalledWith({ context: 'Ctx', stack: 'stack-here' }, 'm');
  });

  it('tolerates a level switch without pretending to apply one', () => {
    const { adapter } = captureLogger();
    expect(() => adapter.setLogLevels(['error'])).not.toThrow();
  });
});

describe('message rendering never dumps an object graph (FR-026)', () => {
  it('passes a string through unchanged', () => {
    const { adapter, sink } = captureLogger();
    adapter.log('plain message');
    expect(sink.info).toHaveBeenCalledWith({ context: undefined }, 'plain message');
  });

  it('uses an Error message rather than stringifying the error object', () => {
    const { adapter, sink } = captureLogger();
    adapter.error(new Error('the useful part'));
    // Stringify(Error) yields `{}` and would lose the message entirely.
    expect(sink.error).toHaveBeenCalledWith(
      { context: undefined, stack: undefined },
      'the useful part',
    );
  });

  it('serialises a plain object, because Nest logs objects for structured context', () => {
    const { adapter, sink } = captureLogger();
    adapter.log({ event: 'startup', port: 3000 });
    expect(sink.info).toHaveBeenCalledWith({ context: undefined }, '{"event":"startup","port":3000}');
  });

  it('falls back to String() for a value JSON cannot represent', () => {
    // Circular structures reach the logger through thrown objects far more often than
    // anyone expects, and `JSON.stringify` throws on them. A logging call that throws
    // takes down the request it was trying to describe.
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;

    const { adapter, sink } = captureLogger();
    expect(() => adapter.log(circular)).not.toThrow();
    expect(sink.info).toHaveBeenCalledWith({ context: undefined }, '[object Object]');
  });

  it('handles undefined without printing the word undefined as if it were content', () => {
    const { adapter, sink } = captureLogger();
    adapter.log(undefined);
    expect(sink.info).toHaveBeenCalledWith({ context: undefined }, 'undefined');
  });
});