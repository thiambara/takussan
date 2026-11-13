'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { buttonVariants } from '@/components/ui/button';

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
 * Décision 2 (c) : `?vue=recherche` rend à ces profils la recherche qu'ils avaient avant le coffre —
 * la liste de leurs documents, cherchée par le serveur (`filter[search]`), jamais le coffre filtré
 * côté client. Le personnel n'en a pas besoin : sa bibliothèque la porte déjà.
 */
export function EspaceDesDocuments({ enTeteDeLaBibliotheque }: { readonly enTeteDeLaBibliotheque: ReactNode }) {
  const t = useTranslations('documents.coffre.recherche');
  const recherche = useSearchParams().get('vue') === 'recherche';
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

  if (recherche) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('titre')}
          description={t('description')}
          actions={
            // TCK-2617 — une seule flèche de retour (celle de la coque) : ce lien dit « Retour aux
            // documents » en toutes lettres, sans flèche.
            <Link href="/app/documents" className={buttonVariants({ variant: 'outline' })}>
              {t('retour')}
            </Link>
          }
        />
        <DocumentsLibrary recherche />
      </div>
    );
  }

  return <CoffreDeDocuments />;
}
