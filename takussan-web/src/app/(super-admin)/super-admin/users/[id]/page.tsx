import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { UserDetailPage } from '@/components/admin/super/user-detail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.userDetail');
  return { title: t('metaTitle') };
}

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const userId = Number(id);

  if (!Number.isInteger(userId) || userId <= 0) {
    notFound();
  }

  return <UserDetailPage userId={userId} />;
}
