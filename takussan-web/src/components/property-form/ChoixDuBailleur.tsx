'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';

import { InviteOwnerSheet } from '@/components/owners/InviteOwnerSheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export type BailleurDuChoix = Pick<OwnerProfileSummary, 'id' | 'user_id' | 'metadata' | 'user'>;

/** TCK-1000 — le bailleur invité depuis le choix : son profil `draft` et le nom saisi. */
export type BailleurInvite = { readonly profileId: number; readonly nom: string };

/** Valeur repère de « l'agence » (aucun bailleur) : une valeur vide n'est pas une option du Select. */
const AGENCE = '__agence__';

/** Le compte désigné d'abord (nom, sinon e-mail), l'invitation en repli, `#<id>` en dernier. */
export function nomDuBailleur(bailleur: BailleurDuChoix): string {
  return nomAffichable({ ...bailleur.user, id: bailleur.user_id ?? bailleur.id }, libelleDe(bailleur.metadata));
}

/**
 * Les bailleurs ACTIFS de l'agence, TOUTES les pages : le serveur filtre (`filter[status]`,
 * `filter[agency_id]`). Pas de champ de recherche : `filter[search]` des profils ne cherche que
 * `employer` (TCK-601, colonnes chiffrées), il ne trouverait aucun nom. Relu par « Changer le
 * titulaire » (TCK-999), qui propose les mêmes bailleurs.
 */
export function useBailleursActifs(agencyId: number) {
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
 *
 * TCK-1000 (Q2, ADR-0036 amendé, voie 2) — « Inviter un nouveau bailleur » (`peutInviter`) ouvre la
 * feuille d'invitation de `/app/owners`. L'invitation partie, le bien est lié au profil invité
 * (`invite`, `pending_owner_profile_id` du corps) : il reste à l'agence jusqu'à l'acceptation.
 * Choisir un bailleur inscrit retire ce lien — les deux ne vont jamais ensemble.
 */
export function ChoixDuBailleur({
  agencyId,
  valeur,
  onChange,
  peutInviter = false,
  invite = null,
  onInvite,
}: {
  readonly agencyId: number;
  readonly valeur: number | null;
  readonly onChange: (ownerId: number | null) => void;
  /** TCK-1000 — l'admin, ou `team.invite` (la règle de `/app/owners`) : la page en juge. */
  readonly peutInviter?: boolean;
  readonly invite?: BailleurInvite | null;
  readonly onInvite?: (invite: BailleurInvite | null) => void;
}) {
  const t = useTranslations('property.wizard.owner');
  const id = useId();
  const bailleurs = useBailleursActifs(agencyId);
  const options = (bailleurs.data?.data ?? []).filter((b) => b.user_id !== null);
  const [feuilleOuverte, setFeuilleOuverte] = useState(false);
  const invitationOfferte = peutInviter && onInvite !== undefined;
  const optionsBailleur = [
    { value: AGENCE, label: t('agency') },
    ...options.map((b) => ({ value: String(b.user_id), label: nomDuBailleur(b) })),
  ];

  return (
    <div className="space-y-2" data-testid="choix-du-bailleur">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {t('label')}
      </label>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      <Select
        value={valeur === null ? AGENCE : String(valeur)}
        onValueChange={(next) => {
          if (next === null) return;
          if (invite !== null) onInvite?.(null);
          onChange(next === AGENCE ? null : Number(next));
        }}
        items={optionsBailleur}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionsBailleur.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {bailleurs.isLoading ? <p className="text-xs text-muted-foreground">{t('loading')}</p> : null}
      {!bailleurs.isLoading && options.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('empty')}</p>
      ) : null}
      {invite !== null ? (
        <div className="space-y-2 rounded-md bg-muted/60 p-3 text-sm text-foreground" data-testid="bailleur-invite">
          <p>{t('invited', { name: invite.nom })}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => onInvite?.(null)}>
            {t('unlink')}
          </Button>
        </div>
      ) : null}
      {invitationOfferte ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setFeuilleOuverte(true)}>
            {t('invite')}
          </Button>
          <InviteOwnerSheet
            open={feuilleOuverte}
            onOpenChange={setFeuilleOuverte}
            agencyId={agencyId}
            onInvited={(invitation, saisie) => {
              if (invitation.invitable_id === null) return;
              const nom = libelleDe(saisie) ?? invitation.email;
              onChange(null);
              onInvite?.({ profileId: invitation.invitable_id, nom });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
