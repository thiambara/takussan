import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { UserDetailPage } from '@/components/admin/super/user-detail';

export const metadata: Metadata = { title: 'Détail utilisateur' };

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const userId = Number(id);

  if (!Number.isInteger(userId) || userId <= 0) {
    notFound();
  }

  return <UserDetailPage userId={userId} />;
}
