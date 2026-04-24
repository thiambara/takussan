import { getMeAction } from '@/app/actions/auth';
import { VisitDetail } from '@/components/visits/VisitDetail';

export const metadata = {
  title: 'Visite',
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getMeAction();
  const { id } = await params;
  return (
    <div className="space-y-6">
      <VisitDetail id={Number(id)} />
    </div>
  );
}
