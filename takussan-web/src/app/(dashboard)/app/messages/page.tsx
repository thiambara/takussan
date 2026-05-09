import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Messagerie' };
import { MessagesPage } from '@/components/messages/MessagesPage';

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Messagerie</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vos conversations</p>
      </div>
      <MessagesPage />
    </div>
  );
}
