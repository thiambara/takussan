'use client';

import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { apiRequest, buildQueryString, type ApiError } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { libelleDe, nomAffichable } from '@/lib/identite';
import type { OwnerProfileSummary } from '@/lib/queries/owners';
import { lireToutesLesPages, PAR_PAGE_MAX } from '@/lib/queries/toutes-les-pages';
import type { PaginatedResponse, SpatieQueryParams } from '@/types/api';

/**
 * TCK-997 (P15.06, P50.01) — les seules colonnes que le choix lit : le compte à désigner
 * (`user_id`) et le nom de l'invitation en repli. Le nom du compte vient de `include=user`.
 */
export const CHOIX_DU_BAILLEUR_FIELDS = ['id', 'user_id', 'metadata'];

type BailleurDuChoix = Pick<OwnerProfileSummary, 'id' | 'user_id' | 'metadata' | 'user'>;

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground';

/** Le compte désigné d'abord (nom, sinon e-mail), l'invitation en repli, `#<id>` en dernier. */
function nomDuBailleur(bailleur: BailleurDuChoix): string {
  return nomAffichable({ ...bailleur.user, id: bailleur.user_id ?? bailleur.id }, libelleDe(bailleur.metadata));
}

/**
 * Les bailleurs ACTIFS de l'agence, TOUTES les pages : le serveur filtre (`filter[status]`,
 * `filter[agency_id]`). Pas de champ de recherche : `filter[search]` des profils ne cherche que
 * `employer` (TCK-601, colonnes chiffrées), il ne trouverait aucun nom.
 */
function useBailleursActifs(agencyId: number) {
  const locale = useLocale();
  const { token } = useAuth();
  const params: SpatieQueryParams = {
    fields: { owner_profiles: CHOIX_DU_BAILLEUR_FIELDS },
    include: ['user'],
    filter: { agency_id: agencyId, status: 'active' },
    sort: ['id'],
  };

  return useQuery<PaginatedResponse<BailleurDuChoix>, ApiError>({
    queryKey: ['owners', 'property-wizard', agencyId],
    queryFn: ({ signal }) =>
      lireToutesLesPages((page) =>
        apiRequest<PaginatedResponse<BailleurDuChoix>>(
          cheminApi`/api/owners${requete(buildQueryString({ ...params, page, per_page: PAR_PAGE_MAX }))}`,
          { token: token ?? undefined, locale, signal },
        ),
      ),
  });
}

/**
 * TCK-997 — « Au nom de qui saisissez-vous ce bien ? ». Facultatif : sans choix, le bien est celui
 * de l'agence (Q1). L'API rejuge le choix (`TitulaireALaSaisie`), cet écran ne fait que le proposer.
 *
 * `valeur` est l'identifiant du COMPTE du bailleur (`owner_id` du corps), jamais celui du profil :
 * un bailleur invité sans compte (`user_id` nul) n'est pas proposé (Q2).
 */
export function ChoixDuBailleur({
  agencyId,
  valeur,
  onChange,
}: {
  readonly agencyId: number;
  readonly valeur: number | null;
  readonly onChange: (ownerId: number | null) => void;
}) {
  const t = useTranslations('property.wizard.owner');
  const id = useId();
  const bailleurs = useBailleursActifs(agencyId);
  const options = (bailleurs.data?.data ?? []).filter((b) => b.user_id !== null);

  return (
    <div className="space-y-2" data-testid="choix-du-bailleur">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {t('label')}
      </label>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      <select
        id={id}
        className={SELECT_CLASS}
        value={valeur === null ? '' : String(valeur)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">{t('agency')}</option>
        {options.map((b) => (
          <option key={b.id} value={String(b.user_id)}>
            {nomDuBailleur(b)}
          </option>
        ))}
      </select>
      {bailleurs.isLoading ? <p className="text-xs text-muted-foreground">{t('loading')}</p> : null}
      {!bailleurs.isLoading && options.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('empty')}</p>
      ) : null}
    </div>
  );
}
