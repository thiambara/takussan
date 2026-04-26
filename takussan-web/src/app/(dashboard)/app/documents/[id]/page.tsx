import { getMeAction } from '@/app/actions/auth';
import { DocumentDetailClient } from '@/components/documents/DocumentDetailClient';

/**
 * TCK-097 — Document detail page with version history.
 * Route: /app/documents/{id}
 */
export const dynamic = 'force-dynamic';

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getMeAction();
  const documentId = parseInt(id, 10);

  return (
    <div className="space-y-6">
      <DocumentDetailClient documentId={documentId} currentUserId={me?.id ?? null} />
    </div>
  );
}
