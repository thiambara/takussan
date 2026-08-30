import type { Metadata } from 'next';
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

  // TCK-442 — la validité de l'identifiant ET l'existence de la ressource sont tranchées par
  // `[id]/layout.tsx`, strictement au-dessus du `loading.tsx` de ce segment : un `notFound()`
  // écrit ici rendrait 200, avec l'écran introuvable affiché quand même. La décision n'a pas
  // changé de nature — un identifiant illisible reste un INTROUVABLE, jamais une panne — elle
  // a changé d'étage, et elle couvre désormais aussi le 404 de l'API.

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
