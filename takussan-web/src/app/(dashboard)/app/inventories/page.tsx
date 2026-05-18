import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'États des lieux' };
import { InventoryList } from '@/components/inventory';

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">États des lieux</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Inventaires d&apos;entrée et de sortie par bail
        </p>
      </div>
      <InventoryList />
    </div>
  );
}
