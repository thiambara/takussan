import type { Message } from '@/types/message';

export type ChatRenderItem =
  | { kind: 'separator'; key: string; date: Date }
  | { kind: 'message'; message: Message };

function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function groupMessagesByDay(messages: readonly Message[]): ChatRenderItem[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const items: ChatRenderItem[] = [];
  let lastDayKey: string | null = null;

  for (const message of sorted) {
    const date = new Date(message.created_at);
    const dayKey = dayKeyOf(date);

    if (dayKey !== lastDayKey) {
      items.push({ kind: 'separator', key: `sep-${dayKey}`, date });
      lastDayKey = dayKey;
    }

    items.push({ kind: 'message', message });
  }

  return items;
}
