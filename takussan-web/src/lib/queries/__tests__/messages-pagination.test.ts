import { describe, expect, it } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import { mergeNewMessages, type MessagesPage } from '../conversations';
import type { Message } from '@/types/message';

function msg(id: number): Message {
  return {
    id,
    conversation_id: 1,
    sender_id: 1,
    content: `m-${id}`,
    type: 'text',
    attachments: [],
    created_at: new Date(2026, 4, 1, 10, 0, id).toISOString(),
    updated_at: new Date(2026, 4, 1, 10, 0, id).toISOString(),
  };
}

function cache(pages: MessagesPage[]): InfiniteData<MessagesPage> {
  return {
    pages,
    pageParams: pages.map((_, idx) => (idx === 0 ? undefined : pages[idx]!.data[0]!.id)),
  };
}

describe('mergeNewMessages', () => {
  it('returns undefined cache untouched', () => {
    expect(mergeNewMessages(undefined, [msg(1)])).toBeUndefined();
  });

  it('is a no-op when no fresh messages are passed', () => {
    const c = cache([{ data: [msg(3), msg(2)], meta: { has_more: false } }]);
    expect(mergeNewMessages(c, [])).toBe(c);
  });

  it('is a no-op when every incoming message is already in cache', () => {
    const c = cache([{ data: [msg(3), msg(2)], meta: { has_more: false } }]);
    expect(mergeNewMessages(c, [msg(2)])).toBe(c);
  });

  it('prepends new messages to page 0 in newest-first order', () => {
    const c = cache([
      { data: [msg(3), msg(2)], meta: { has_more: true } },
      { data: [msg(1)], meta: { has_more: false } },
    ]);
    const next = mergeNewMessages(c, [msg(4), msg(5)]);
    expect(next).toBeDefined();
    expect(next!.pages[0]!.data.map((m) => m.id)).toEqual([5, 4, 3, 2]);
    expect(next!.pages[1]!.data.map((m) => m.id)).toEqual([1]);
  });

  it('deduplicates against ALL loaded pages, not only page 0', () => {
    const c = cache([
      { data: [msg(3)], meta: { has_more: true } },
      { data: [msg(2), msg(1)], meta: { has_more: false } },
    ]);
    const next = mergeNewMessages(c, [msg(1), msg(4)]);
    expect(next!.pages[0]!.data.map((m) => m.id)).toEqual([4, 3]);
  });

  it('preserves the meta of page 0 (has_more flag stays)', () => {
    const c = cache([{ data: [msg(2)], meta: { has_more: true } }]);
    const next = mergeNewMessages(c, [msg(3)]);
    expect(next!.pages[0]!.meta).toEqual({ has_more: true });
  });
});
