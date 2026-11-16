'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Eye } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { ErreurDeLecture } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { BoutonRetour } from '@/components/shared/BoutonRetour';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  fetchPropertyModerationDetail,
  propertyModerationDetailKey,
  type PropertyModerationDetail,
} from '@/lib/queries/property-moderation';

import { Caracteristiques, Carrousel, Description, EnTeteDeLAnnonce, Mosaique, Photo, Soumission } from './PropertyModerationDetail';

/** La file des biens à valider, ce bien sélectionné : le retour de l'aperçu. */
const retourALaFile = (id: number) => `/app/agency/moderation/properties?selected=${id}`;

/**
 * TCK-2931 — l'aperçu complet d'un bien à valider : la fiche du bien comme le public la verra
 * (photos, titre, lieu, prix, caractéristiques, description, toutes les photos), « Soumis par » et
 * « Écrire », sous le bandeau « Aperçu — ce bien n'est pas encore publié ».
 *
 * Rendu depuis la SEULE lecture de modération (`GET /api/properties/moderation/{id}`, même garde
 * que la file) : aucune route publique ne voit un bien non publié. Les pièces sont celles du détail
 * de la file (`PropertyModerationDetail`) : l'aperçu et la file disent la même chose.
 *
 * Téléphone : le carrousel ; dès `md`, la mosaïque de la fiche publique.
 */
export function ApercuDuBienAValider({ id, initial }: { readonly id: number; readonly initial: PropertyModerationDetail | null }) {
  const t = useTranslations('admin.propertyModeration.bien');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();

  const detail = useQuery({
    queryKey: propertyModerationDetailKey(id),
    queryFn: () => fetchPropertyModerationDetail(id, token ?? ''),
    enabled: Boolean(token),
    initialData: initial ? { data: initial } : undefined,
    // La lecture du serveur vient d'avoir lieu : le navigateur ne la refait pas aussitôt.
    staleTime: 30_000,
  });
  const bien = detail.data?.data ?? null;

  const enTete = <DeclarerEnTete forme="detail" titre={bien?.title ?? t('apercuMeta')} repli={retourALaFile(id)} />;

  if (!bien) {
    return (
      <div className="space-y-4" data-testid="apercu-du-bien-a-valider">
        {enTete}
        {detail.isError ? (
          <ErreurDeLecture
            erreur={detail.error}
            message={messageErreur(detail.error, t('detailIllisible'))}
            onRetry={() => void detail.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        ) : (
          <div role="status" className="space-y-3">
            <span className="sr-only">{t('apercuMeta')}</span>
            <Skeleton className="aspect-[4/3] w-full rounded-xl md:h-[calc(var(--spacing)*75)]" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-5xl md:space-y-4" data-testid="apercu-du-bien-a-valider" aria-labelledby="apercu-titre">
      {enTete}
      {/* Bureau : le lien « ← Retour à la file » unique (TCK-2617) ; au téléphone, la flèche de la coque. */}
      <div className="hidden md:block">
        <BoutonRetour repli={retourALaFile(id)} libelle={t('retourALaFile')} />
      </div>

      <p
        role="note"
        className="flex items-center gap-2 bg-warning/10 px-4 py-2.5 text-sm font-medium md:rounded-lg"
        data-slot="bandeau-d-apercu"
      >
        <Eye className="size-4 flex-none text-warning" strokeWidth={1.75} aria-hidden="true" />
        {t('apercuBandeau')}
      </p>

      <div className="overflow-hidden bg-card md:rounded-xl md:border md:border-border">
        <div className="md:hidden">
          <Carrousel bien={bien} />
        </div>
        <div className="hidden md:block">
          <Mosaique bien={bien} />
        </div>
        <div className="space-y-4 p-4 md:p-6">
          <div id="apercu-titre">
            <EnTeteDeLAnnonce bien={bien} grand />
          </div>
          <Caracteristiques bien={bien} />
          <Description bien={bien} />
          {bien.photos.length > 1 ? (
            <ul className="grid grid-cols-3 gap-1.5 md:grid-cols-4" aria-label={t('toutesLesPhotos')}>
              {bien.photos.map((p) => (
                <li key={p.id} className="aspect-square overflow-hidden rounded-lg bg-muted">
                  <Photo url={p.full_url ?? p.url} />
                </li>
              ))}
            </ul>
          ) : null}
          <Soumission bien={bien} />
        </div>
      </div>
    </article>
  );
}
