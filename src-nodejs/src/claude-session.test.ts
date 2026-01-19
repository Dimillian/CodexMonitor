import { describe, expect, it } from 'vitest';
import {
  buildToolItem,
  buildToolOutputEvent,
  buildTurnErrorEvent,
  mapDecisionToPermissionResult,
} from './claude-session.js';

describe('mapDecisionToPermissionResult', () => {
  it('allows when decision is accept', () => {
    const result = mapDecisionToPermissionResult({ decision: 'accept' }, 'tool-1');
    expect(result.behavior).toBe('allow');
    expect(result.toolUseID).toBe('tool-1');
  });

  it('denies when decision is decline', () => {
    const result = mapDecisionToPermissionResult({ decision: 'decline' }, 'tool-2');
    expect(result.behavior).toBe('deny');
    expect((result as { message?: string }).message).toBe('Tool use denied by user.');
    expect(result.toolUseID).toBe('tool-2');
  });

  it('allows when approved flag is true', () => {
    const result = mapDecisionToPermissionResult({ approved: true }, 'tool-3');
    expect(result.behavior).toBe('allow');
    expect(result.toolUseID).toBe('tool-3');
  });
});

describe('tool event builders', () => {
  it('builds file change tool items and output events', () => {
    const { item, outputMethod } = buildToolItem(
      'Write',
      { file_path: 'notes.txt' },
      '/tmp',
      'tool-4',
    );
    expect(item.type).toBe('fileChange');
    expect(outputMethod).toBe('item/fileChange/outputDelta');
    expect((item as { status?: string }).status).toBe('running');
    const event = buildToolOutputEvent('thread-1', 'turn-1', 'tool-4', 'diff', outputMethod);
    expect(event.method).toBe('item/fileChange/outputDelta');
    expect(event.params.itemId).toBe('tool-4');
  });

  it('builds command tool items and output events', () => {
    const { item, outputMethod } = buildToolItem(
      'Bash',
      { command: 'ls' },
      '/tmp',
      'tool-5',
    );
    expect(item.type).toBe('commandExecution');
    expect(outputMethod).toBe('item/commandExecution/outputDelta');
    expect((item as { status?: string }).status).toBe('running');
    const event = buildToolOutputEvent('thread-2', 'turn-2', 'tool-5', 'out', outputMethod);
    expect(event.method).toBe('item/commandExecution/outputDelta');
    expect(event.params.itemId).toBe('tool-5');
  });
});

describe('buildTurnErrorEvent', () => {
  it('wraps errors with the error method', () => {
    const event = buildTurnErrorEvent('thread-3', 'turn-3', 'boom');
    expect(event.method).toBe('error');
    expect(event.params.error.message).toBe('boom');
    expect(event.params.willRetry).toBe(false);
  });
});
