'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { ApiError, messageErreurApi } from '@/lib/api';
import {
  PROPERTY_COLLABORATORS_QUERY_KEY,
  collaboratorName,
  designatePrimaryCollaborator,
  fetchPropertyCollaborators,
  type CollaboratorRole,
  type PropertyCollaboratorsPayload,
} from '@/lib/queries/property-collaborators';

interface PropertyCollaboratorsPanelProps {
  readonly propertyId: number;
}

const ROLES: readonly CollaboratorRole[] = ['agent', 'manager', 'co_owner', 'viewer'];

/**
 * TCK-504 — **qui répond pour ce bien, et le choisir.**
 *
 * La fiche de l'espace pro n'avait aucun écran de collaborateurs (relevé du ticket) : ce panneau
 * les liste, distingue celui qui répond, et permet d'en désigner un autre en un geste. Il dit en
 * clair ce que le choix change — la personne que la fiche publique nomme, qui reçoit les messages
 * et les demandes, et dont le numéro s'affiche.
 *
 * Un bien sans choix n'a pas l'air mal configuré : le repli (l'agent invité le premier, sinon le
 * propriétaire) est énoncé sobrement, sans alerte. Seul un `agent` porte le bouton ; le serveur
 * refuse les autres rôles de toute façon, et son refus s'affiche tel quel.
 */
export function PropertyCollaboratorsPanel({ propertyId }: PropertyCollaboratorsPanelProps) {
  const t = useTranslations('property.dashboard.collaborators');
  const tRacine = useTranslations();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = PROPERTY_COLLABORATORS_QUERY_KEY.list(propertyId);

  const query = useQuery<PropertyCollaboratorsPayload, ApiError>({
    queryKey,
    queryFn: () => fetchPropertyCollaborators(token ?? '', propertyId),
    enabled: !!token,
    retry: false,
  });

  const designation = useMutation<PropertyCollaboratorsPayload, unknown, number>({
    mutationFn: (collaboratorId) => designatePrimaryCollaborator(token ?? '', propertyId, collaboratorId),
    onSuccess: (payload) => {
      queryClient.setQueryData(queryKey, payload);
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
    },
  });

  // Un refus de lecture (le bien n'est pas de ceux que l'appelant voit) ne s'affiche pas : la
  // page elle-même l'aurait déjà refusé.
  if (query.isError) return null;

  const rows = query.data?.data ?? [];
  const contact = query.data?.primary_contact;
  const source = contact?.source ?? null;

  return (
    <section className="rounded-xl bg-card p-6" data-testid="property-collaborators" aria-labelledby="property-collaborators-title">
      <header>
        <h2 id="property-collaborators-title" className="text-base font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1 text-xs text-pretty text-muted-foreground">{t('explanation')}</p>
      </header>

      {query.isPending ? (
        <div className="mt-4 space-y-2" aria-hidden="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          {source ? (
            <p className="mt-4 text-sm text-pretty text-foreground" data-testid="primary-contact-source">
              {t(`source.${source}`)}
            </p>
          ) : null}

          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {rows.map((row) => {
                const repond = contact?.collaborator_id === row.id;
                const role = ROLES.includes(row.role) ? t(`roles.${row.role}`) : row.role;
                const designable = row.role === 'agent' && !row.is_primary;
                const enCours = designation.isPending && designation.variables === row.id;

                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3"
                    data-testid={`collaborator-${row.id}`}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        <span className="truncate">{collaboratorName(row)}</span>
                        {row.is_primary ? (
                          <Badge>
                            <Star aria-hidden="true" />
                            {t('badge.designated')}
                          </Badge>
                        ) : repond ? (
                          <Badge variant="outline">{t('badge.default')}</Badge>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{role}</p>
                    </div>
                    {designable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={designation.isPending}
                        onClick={() => designation.mutate(row.id)}
                        aria-label={t('designateFor', { name: collaboratorName(row) })}
                      >
                        {enCours ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                        {t('designate')}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {designation.isError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {messageErreurApi(designation.error, tRacine, t('error'))}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
