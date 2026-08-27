import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { DocumentDetailClient } from '@/components/documents/DocumentDetailClient';

/**
 * TCK-097 — Document detail page with version history.
 * Route: /app/documents/{id}
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.documentDetail');
  return { title: t('metaTitle') };
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getMeAction();
  const documentId = Number.parseInt(id, 10);

  // `parseInt('abc')` rendait `NaN`, passé tel quel au client. Un identifiant illisible est un
  // introuvable — cf. `app/not-found.tsx`.
  if (!Number.isFinite(documentId) || documentId <= 0) notFound();

  return (
    <div className="space-y-6">
      <DocumentDetailClient
        documentId={documentId}
        currentUserId={me?.id ?? null}
        currentUserRoles={me?.roles ?? []}
      />
    </div>
  );
}
