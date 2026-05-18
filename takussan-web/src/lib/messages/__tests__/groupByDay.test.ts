import { describe, expect, it } from 'vitest';
import { groupMessagesByDay } from '../groupByDay';
import type { Message } from '@/types/message';

function msg(id: number, created_at: string): Message {
  return {
    id,
    conversation_id: 1,
    sender_id: 1,
    content: `msg-${id}`,
    type: 'text',
    attachments: [],
    created_at,
    updated_at: created_at,
  };
}

describe('groupMessagesByDay', () => {
  it('returns an empty array for empty input', () => {
    expect(groupMessagesByDay([])).toEqual([]);
  });

  it('inserts a single separator when all messages are on the same day', () => {
    const items = groupMessagesByDay([
      msg(1, '2026-05-15T08:00:00Z'),
      msg(2, '2026-05-15T09:30:00Z'),
      msg(3, '2026-05-15T22:00:00Z'),
    ]);

    expect(items.map((i) => i.kind)).toEqual([
      'separator',
      'message',
      'message',
      'message',
    ]);
  });

  it('sorts ascending and inserts a separator at every day transition', () => {
    const items = groupMessagesByDay([
      msg(3, '2026-05-16T10:00:00Z'),
      msg(1, '2026-05-14T09:00:00Z'),
      msg(2, '2026-05-15T11:00:00Z'),
      msg(4, '2026-05-16T18:00:00Z'),
    ]);

    expect(items.map((i) => i.kind)).toEqual([
      'separator',
      'message',
      'separator',
      'message',
      'separator',
      'message',
      'message',
    ]);

    const messageIds = items
      .filter((i): i is { kind: 'message'; message: Message } => i.kind === 'message')
      .map((i) => i.message.id);
    expect(messageIds).toEqual([1, 2, 3, 4]);
  });

  it('produces stable separator keys per day', () => {
    const items = groupMessagesByDay([
      msg(1, '2026-05-14T09:00:00Z'),
      msg(2, '2026-05-15T11:00:00Z'),
    ]);
    const separatorKeys = items
      .filter((i): i is { kind: 'separator'; key: string; date: Date } => i.kind === 'separator')
      .map((i) => i.key);
    expect(new Set(separatorKeys).size).toBe(2);
  });
});
