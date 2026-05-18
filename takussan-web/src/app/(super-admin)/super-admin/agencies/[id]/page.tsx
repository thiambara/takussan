import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AgencyDetailPage } from '@/components/admin/super/agency-detail';

export const metadata: Metadata = { title: 'Détail agence' };

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const agencyId = Number(id);

  if (!Number.isInteger(agencyId) || agencyId <= 0) {
    notFound();
  }

  return <AgencyDetailPage agencyId={agencyId} />;
}
