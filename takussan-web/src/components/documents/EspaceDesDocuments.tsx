'use client';

import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useAgenceDuPersonnelActif } from '@/hooks/usePersonnelActif';
import { useMyProfiles } from '@/hooks/useProfiles';

import { CoffreDeDocuments } from './coffre/CoffreDeDocuments';
import { DocumentsLibrary } from './DocumentsLibrary';

/**
 * TCK-2656 — `/app/documents` selon le profil ACTIF : le personnel de l'agence garde la bibliothèque
 * de l'agence ; le locataire, le bailleur et le prestataire ouvrent leur coffre, rangé par dossier
 * (`GET /api/me/document-vault`).
 *
 * Tant que les profils ne sont pas lus, ni l'un ni l'autre : les deux écrans lisent deux endpoints
 * différents, et montrer le mauvais d'abord ferait partir sa requête pour rien.
 *
 * TCK-2769 — la recherche de ces profils est celle du coffre (« Chercher un document », `?q=`), jugée
 * par le serveur, documents générés compris : elle remplace `?vue=recherche` de TCK-2656, qui ne
 * cherchait que les documents téléversés. Le personnel garde celle de sa bibliothèque.
 */
export function EspaceDesDocuments({ enTeteDeLaBibliotheque }: { readonly enTeteDeLaBibliotheque: ReactNode }) {
  const { user } = useAuth();
  const profils = useMyProfiles();
  const agence = useAgenceDuPersonnelActif();

  if (user && profils.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (agence !== null) {
    return (
      <div className="space-y-6">
        {enTeteDeLaBibliotheque}
        <DocumentsLibrary />
      </div>
    );
  }

  return <CoffreDeDocuments />;
}
