import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Documents' };
import { DocumentsLibrary } from '@/components/documents/DocumentsLibrary';

/**
 * TCK-062 — bibliothèque centralisée des documents avec filtres, upload
 * drag-drop et partage par lien temporaire.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await getMeAction();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-app-ink">Documents</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Centralisez les contrats, pièces d&apos;identité, quittances et
          justificatifs de vos biens, baux et clients.
        </p>
      </header>
      <DocumentsLibrary />
    </div>
  );
}
