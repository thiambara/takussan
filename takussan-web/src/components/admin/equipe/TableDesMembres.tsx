'use client';

import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initialesDe, nomAffichable } from '@/lib/identite';
import type { TeamSuspensionAction } from '@/lib/queries/team-suspension';
import { cn } from '@/lib/utils';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgencyRoleAssignment } from '@/types/agency-role';

import { etatDuMembre, roleDuMembre } from './etat-de-l-equipe';
import { DeuxFacteurs, PuceDEtat, PuceVous, TexteConnexion } from './pieces';

/**
 * TCK-2667 — le tableau des membres au bureau (maquette `app-equipe`, a, « Liste » : `TableMembres`) :
 * Membre (nom, « Vous », e-mail) · Rôle (et taux) · Statut et absence · Double auth. · Biens suivis ·
 * Commissions dues · Dernière connexion · « … ». Sans bailleurs.
 *
 * La colonne « Commissions dues » n'existe que si la réponse porte la clé `commissions_due_amount`
 * (l'API ne la rend qu'à qui lit l'argent de l'agence, TCK-2665) : une clé absente n'est pas un zéro
 * (AC4). Sous `xl`, le tableau défile dans son cadre (ADR-0106 § 4), jamais la page.
 */
const COLONNES =
  'grid grid-cols-[minmax(0,2.1fr)_1.15fr_1.85fr_0.95fr_0.75fr_1.1fr_1.35fr_calc(var(--spacing)*11)] min-[90rem]:grid-cols-[minmax(0,2.3fr)_1.25fr_1.9fr_1fr_0.85fr_1.2fr_1.2fr_calc(var(--spacing)*11)] items-center gap-x-4';
const COLONNES_SANS_DUES =
  'grid grid-cols-[minmax(0,2.1fr)_1.15fr_1.85fr_0.95fr_0.75fr_1.35fr_calc(var(--spacing)*11)] min-[90rem]:grid-cols-[minmax(0,2.3fr)_1.25fr_1.9fr_1fr_0.85fr_1.2fr_calc(var(--spacing)*11)] items-center gap-x-4';

interface TableDesMembresProps {
  readonly membres: readonly AdminAgencyUserRow[];
  readonly agencyId: number;
  readonly currentUserId: number;
  readonly affectations: ReadonlyMap<number, readonly AgencyRoleAssignment[]>;
  readonly tri: string;
  readonly onTrier: (tri: string) => void;
  readonly selectionne: number | null;
  readonly onOuvrir: (membre: AdminAgencyUserRow) => void;
  readonly suspensionDe: (membre: AdminAgencyUserRow) => TeamSuspensionAction | null;
  readonly onSuspension: (membre: AdminAgencyUserRow, action: TeamSuspensionAction) => void;
  /** Absent : « Retirer » n'est pas offert (ni admin, ni `team.remove`). */
  readonly onRetirer?: (membre: AdminAgencyUserRow) => void;
}

/** L'en-tête qui trie : un bouton, l'ordre dit par `aria-sort` sur la colonne. */
function EnTeteTriable({
  libelle,
  cle,
  tri,
  onTrier,
}: {
  readonly libelle: string;
  readonly cle: string;
  readonly tri: string;
  readonly onTrier: (tri: string) => void;
}) {
  const t = useTranslations('admin.team.equipe.table');
  const actif = tri === cle || tri === `-${cle}`;
  const descendant = tri === `-${cle}`;
  return (
    <span role="columnheader" aria-sort={actif ? (descendant ? 'descending' : 'ascending') : 'none'} className="flex items-center">
      <button
        type="button"
        onClick={() => onTrier(actif && !descendant ? `-${cle}` : cle)}
        className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={t('trierPar', { colonne: libelle })}
      >
        {libelle}
        {descendant ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
      </button>
    </span>
  );
}

export function TableDesMembres({
  membres,
  agencyId,
  currentUserId,
  affectations,
  tri,
  onTrier,
  selectionne,
  onOuvrir,
  suspensionDe,
  onSuspension,
  onRetirer,
}: TableDesMembresProps) {
  const t = useTranslations('admin.team.equipe');
  const tSuspension = useTranslations('admin.team.suspension');
  const { montantCourt } = useFormatteurs();
  const avecDues = membres.some((m) => m.commissions_due_amount !== undefined);
  const colonnes = avecDues ? COLONNES : COLONNES_SANS_DUES;

  return (
    // Le tableau défile dans son cadre, qui rogne : la colonne d'actions reste atteignable quand la
    // fiche ouverte resserre la page, sans que le document défile (TCK-371, invariant de structure).
    <div className="overflow-hidden rounded-xl border border-border bg-card" data-slot="table-des-membres">
      <div className="overflow-x-auto">
        <div role="table" aria-label={t('table.aria')} aria-rowcount={membres.length + 1} className="min-w-[calc(var(--spacing)*220)]">
          <div role="row" className={cn(colonnes, 'h-10 border-b border-border bg-muted/40 px-4 text-xs font-medium text-muted-foreground')}>
            <EnTeteTriable libelle={t('table.membre')} cle="first_name" tri={tri} onTrier={onTrier} />
            <span role="columnheader">{t('table.role')}</span>
            <span role="columnheader">{t('table.statut')}</span>
            <span role="columnheader">{t('table.deuxFA')}</span>
            <span role="columnheader" className="text-right">
              {t('table.biens')}
            </span>
            {avecDues ? (
              <span role="columnheader" className="text-right">
                {t('table.dues')}
              </span>
            ) : null}
            <EnTeteTriable libelle={t('table.connexion')} cle="last_login_at" tri={tri} onTrier={onTrier} />
            <span role="columnheader">
              <span className="sr-only">{t('table.ouvrir')}</span>
            </span>
          </div>
          {membres.map((m) => {
            const etat = etatDuMembre(m, agencyId);
            const role = roleDuMembre(m, agencyId);
            const aff = affectations.get(m.id) ?? [];
            const nomDuRole = aff.find((a) => a.profile_type === role)?.agency_role_name ?? t(`role.${role}`);
            const taux = aff.find((a) => a.profile_type === 'agent')?.commission_rate;
            const suspension = suspensionDe(m);
            const soi = m.id === currentUserId;
            const personnel = aff.length > 0 ? aff.some((a) => a.profile_type === 'agent' || a.profile_type === 'agency_admin') : true;
            return (
              <div
                key={m.id}
                role="row"
                data-testid={`membre-${m.id}`}
                data-actif={selectionne === m.id ? '' : undefined}
                className={cn(
                  colonnes,
                  'min-h-[3.625rem] border-b border-border/70 px-4 py-2 text-sm last:border-b-0',
                  selectionne === m.id && 'bg-secondary/60',
                )}
              >
                <span role="cell" className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOuvrir(m)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Avatar size="36" className={cn(etat === 'suspendu' && 'opacity-50')}>
                      <AvatarFallback>{initialesDe(m) ?? '·'}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 leading-tight">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('truncate font-semibold', etat === 'suspendu' && 'text-encre-douce')}>{nomAffichable(m)}</span>
                        {soi ? <PuceVous /> : null}
                      </span>
                      {m.email ? <span className="block truncate text-xs text-muted-foreground">{m.email}</span> : null}
                    </span>
                  </button>
                </span>
                <span role="cell" className="truncate text-encre-douce">
                  {nomDuRole}
                  {typeof taux === 'number' ? <span className="text-muted-foreground"> · {taux} %</span> : null}
                </span>
                <span role="cell" className="min-w-0">
                  <PuceDEtat membre={m} agencyId={agencyId} />
                  {etat === 'absent' && m.current_absence?.substitute ? (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t('etat.couvertPar', { nom: m.current_absence.substitute.name })}
                    </span>
                  ) : null}
                </span>
                <span role="cell" className="text-ui">
                  {m.two_factor_enabled !== undefined ? <DeuxFacteurs active={m.two_factor_enabled} /> : null}
                </span>
                <span role="cell" className="text-right tabular-nums">
                  {m.properties_followed_count ? m.properties_followed_count : '—'}
                </span>
                {avecDues ? (
                  <span role="cell" className={cn('text-right tabular-nums', m.commissions_due_amount ? 'font-semibold' : 'text-muted-foreground')}>
                    {m.commissions_due_amount ? montantCourt(m.commissions_due_amount) : '—'}
                  </span>
                ) : null}
                <span role="cell" className="truncate text-ui text-muted-foreground">
                  <TexteConnexion derniereConnexion={m.last_login_at} />
                </span>
                <span role="cell" className="justify-self-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label={t('table.actions', { nom: nomAffichable(m) })} />}
                    >
                      <MoreHorizontal className="size-icone" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOuvrir(m)}>{t('table.ouvrir')}</DropdownMenuItem>
                      {suspension ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onSuspension(m, suspension)}
                            className={suspension === 'suspend' ? 'text-destructive' : undefined}
                          >
                            {suspension === 'suspend' ? tSuspension('suspend') : tSuspension('reactivate')}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {onRetirer && personnel && !soi ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onRetirer(m)} className="text-destructive">
                            {t('fiche.retirer')}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
