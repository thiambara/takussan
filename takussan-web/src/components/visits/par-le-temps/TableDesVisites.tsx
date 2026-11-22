'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Vignette } from '@/components/visits/planification/PiecesDeLaPlanification';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initiales } from '@/lib/fiche-publique';
import { nomAffichable } from '@/lib/identite';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyVisit } from '@/types/visit';

import { VISIT_STATUS_LABEL_KEY, VISIT_STATUS_TONE } from '../visit-status';
import { ConfirmerALHeure, TypeDeVisite } from './cartes';
import { jourADakar } from '@/lib/visites/par-le-temps';
import { jourEnClair } from '@/lib/visites/planification';
import { type HeureProposee, nomDuVisiteur, useDureeEnClair, useHeuresProposees } from './pieces';

/** Un agent qu'on peut attribuer : le personnel de l'agence (`filter[assignable]`). */
interface AgentAttribuable {
  readonly id: number;
  readonly first_name: string | null;
  readonly last_name: string | null;
}

export function useAgentsAttribuables(agence: number | null) {
  return useApiQuery<PaginatedResponse<AgentAttribuable>>(['agency-members', agence ?? 0, 'assign'], `/api/agencies/${agence ?? 0}/members`, {
    params: { fields: { users: ['id', 'first_name', 'last_name'] }, filter: { assignable: 1 }, sort: 'first_name', per_page: 100 },
    enabled: agence !== null,
  });
}

/** « Attribuer ▾ » : la liste du personnel de l'agence ; le choix part tel quel (`bulk-assign`). */
export function AttribuerA({
  agence,
  onChoisir,
  declencheur,
  disabled,
}: {
  readonly agence: number;
  readonly onChoisir: (agentId: number) => void;
  readonly declencheur: ReactElement;
  readonly disabled?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const agents = useAgentsAttribuables(ouvert ? agence : null);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger disabled={disabled} render={declencheur} />
      <PopoverContent align="end" className="max-h-80 w-64 overflow-y-auto p-1">
        {(agents.data?.data ?? []).map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              setOuvert(false);
              onChoisir(a.id);
            }}
            className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
          >
            {nomAffichable(a)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** « Mer. 11 nov. » : le jour d'une ligne du tableau, à Dakar. */
function jourDeLaLigne(iso: string, locale: string): string {
  const texte = jourEnClair(jourADakar(new Date(iso)), locale);
  return texte.charAt(0).toLocaleUpperCase() + texte.slice(1);
}

function Th({ children, className }: { readonly children?: ReactNode; readonly className?: string }) {
  return <th className={cn('px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground', className)}>{children}</th>;
}

function AgentCellule({ v }: { readonly v: PropertyVisit }) {
  const tPlanning = useTranslations('visitPlanning');
  if (!v.agent_id || !v.agent) {
    return v.status === 'scheduled' || v.status === 'confirmed' ? <StatusBadge tone="attention" label={tPlanning('unassignedBadge')} /> : null;
  }
  const nom = nomAffichable(v.agent);
  return (
    // Sous 1440 (maquette « bureau 1280 ») : l'agent se réduit à son avatar, le nom au lecteur d'écran.
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={nom}>
      <span className="inline-flex size-6 flex-none items-center justify-center rounded-full bg-fond-avatar text-legende font-semibold text-encre-avatar" aria-hidden="true">
        {initiales(nom)}
      </span>
      <span className="hidden w1440:inline">{nom}</span>
      <span className="sr-only w1440:hidden">{nom}</span>
    </span>
  );
}

export interface GestesDeLaTable {
  readonly onConfirmer: (v: PropertyVisit, heure: HeureProposee) => void;
  readonly onAttribuer: (ids: readonly number[], agentId: number) => void;
  readonly enCours: number | null;
}

interface LigneProps {
  readonly v: PropertyVisit;
  readonly coche: boolean;
  readonly refus: string | null;
  readonly onCocher: (coche: boolean) => void;
  readonly onHeureProposee: (id: number, heure: HeureProposee | null) => void;
  readonly gestes: GestesDeLaTable | null;
  readonly agence: number | null;
}

function Ligne({ v, coche, refus, onCocher, onHeureProposee, gestes, agence }: LigneProps) {
  const t = useTranslations('visits.parLeTemps');
  const tVisits = useTranslations('visits');
  const f = useFormatteurs();
  const duree = useDureeEnClair();
  const nom = nomDuVisiteur(v) ?? t('visiteur');
  const aConfirmer = v.status === 'scheduled';
  const proposees = useHeuresProposees(v, (iso) => f.heure(iso), gestes !== null && aConfirmer);
  const tranche = aConfirmer ? (v.preferred_window ?? null) : null;
  const premiere = tranche ? (proposees.heures[0] ?? null) : null;
  // Suivi du lot A : l'agent de la visite est parti ou suspendu (`/slots` refuse son `agent_id`).
  const indisponible = aConfirmer && proposees.etat === 'agent-indisponible';
  const clePremiere = premiere?.start ?? null;
  // La barre de sélection redit les heures proposées des tranches cochées : la ligne les lui remonte.
  useEffect(() => {
    if (tranche) onHeureProposee(v.id, premiere);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clé de l'heure suffit
  }, [v.id, tranche, clePremiere]);
  const titre = v.property?.title?.trim() || tVisits('fallbackTitle', { id: String(v.id) });
  const quartier = v.property?.address?.neighborhood?.trim();
  const status = v.status ?? 'scheduled';
  const rang = v.visitor_display?.visits_on_property ? t('rang', { n: v.visitor_display.visits_on_property }) : null;

  return (
    <tr data-slot="ligne-de-visite" data-coche={coche || undefined} className={cn('border-b border-border last:border-0', coche && 'bg-secondary/45')}>
      <td className="pl-4">
        {gestes ? <Checkbox checked={coche} onCheckedChange={(c) => onCocher(c === true)} aria-label={t('bureau.cocher', { nom: `${titre} · ${nom}` })} /> : null}
      </td>
      <td className="px-3 py-3">
        <p className="font-medium whitespace-nowrap text-foreground">{v.scheduled_at ? jourDeLaLigne(v.scheduled_at, f.locale) : '—'}</p>
        <p className={cn('text-ui whitespace-nowrap tabular-nums', tranche ? 'font-medium text-warning' : 'text-muted-foreground')}>
          {tranche ? t('aFixer', { tranche: t(`tranchesCourtes.${tranche}`) }) : `${f.heure(v.scheduled_at)} · ${duree(v.duration_minutes ?? 30)}`}
        </p>
      </td>
      <td className="px-3">
        <div className="flex items-center gap-2.5">
          <Vignette src={v.property?.cover_url} className="hidden size-10 w1440:inline-flex" />
          <div className="max-w-61 min-w-0">
            <p className="truncate font-medium text-foreground">
              <Link href={`/app/visits/${v.id}`} className="outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
                {quartier ? `${titre} · ${quartier}` : titre}
              </Link>
            </p>
            {v.property?.address?.line ? <p className="truncate text-ui text-muted-foreground">{v.property.address.line}</p> : null}
          </div>
        </div>
      </td>
      <td className="px-3">
        <p className="font-medium whitespace-nowrap text-foreground">{nom}</p>
        <p className="max-w-41.75 truncate text-ui text-muted-foreground w1440:max-w-58.25">{v.notes?.trim() ? `« ${v.notes.trim()} »` : rang}</p>
        {refus ? (
          <p data-slot="refus-de-la-ligne" role="status" className="mt-0.5 max-w-60 text-ui font-medium text-destructive">
            {refus}
          </p>
        ) : null}
      </td>
      <td className="px-3">
        <AgentCellule v={v} />
        {indisponible ? (
          <p role="status" data-slot="agent-indisponible" className="mt-0.5 max-w-48 text-ui font-medium text-warning">
            {t('agentIndisponible')}
          </p>
        ) : null}
      </td>
      <td className="px-3">
        <StatusBadge tone={VISIT_STATUS_TONE[status]} label={tVisits(VISIT_STATUS_LABEL_KEY[status])} />
        {v.type ? <TypeDeVisite type={v.type} className="mt-1 flex" /> : null}
      </td>
      <td className="py-2 pr-4 pl-3 text-right">
        {gestes && aConfirmer && v.agent_id && !indisponible ? (
          <ConfirmerALHeure v={v} proposees={proposees.heures} etat={proposees.etat} enCours={gestes.enCours === v.id} onConfirmer={gestes.onConfirmer} taille="table" />
        ) : gestes && aConfirmer && agence !== null ? (
          <AttribuerA
            agence={agence}
            onChoisir={(agentId) => gestes.onAttribuer([v.id], agentId)}
            declencheur={
              <button type="button" className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring">
                {indisponible ? t('reattribuer') : t('bureau.attribuer')}
              </button>
            }
          />
        ) : (
          <Link href={`/app/visits/${v.id}`} className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring">
            {t('bureau.ouvrir')}
          </Link>
        )}
      </td>
    </tr>
  );
}

interface TableDesVisitesProps {
  readonly visites: readonly PropertyVisit[];
  readonly coches: ReadonlySet<number>;
  readonly refus: ReadonlyMap<number, string>;
  readonly onCocher: (ids: readonly number[], coche: boolean) => void;
  readonly onHeureProposee: (id: number, heure: HeureProposee | null) => void;
  readonly gestes: GestesDeLaTable | null;
  readonly agence: number | null;
}

/** Le tableau du bureau : Quand · Bien · Visiteur · Agent · Statut · type · Geste, avec sélection. */
export function TableDesVisites({ visites, coches, refus, onCocher, onHeureProposee, gestes, agence }: TableDesVisitesProps) {
  const t = useTranslations('visits.parLeTemps.bureau');
  const toutes = visites.length > 0 && visites.every((v) => coches.has(v.id));
  const certaines = !toutes && visites.some((v) => coches.has(v.id));
  return (
    // Sous xl, le tableau défile dans sa carte, `relative` pour y garder le nom d'agent `sr-only`.
    <div data-slot="table-des-visites" className="overflow-x-auto rounded-xl border border-border bg-card max-xl:relative">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <Th className="w-10 pl-4">
              {gestes ? (
                <Checkbox
                  checked={toutes}
                  indeterminate={certaines}
                  onCheckedChange={(c) => onCocher(visites.map((v) => v.id), c === true)}
                  aria-label={t('toutCocher')}
                />
              ) : null}
            </Th>
            <Th>{t('quand')}</Th>
            <Th>{t('bien')}</Th>
            <Th>{t('visiteur')}</Th>
            <Th>{t('agent')}</Th>
            <Th>{t('statutType')}</Th>
            <Th className="pr-4 text-right">{t('geste')}</Th>
          </tr>
        </thead>
        <tbody>
          {visites.map((v) => (
            <Ligne
              key={v.id}
              v={v}
              coche={coches.has(v.id)}
              refus={refus.get(v.id) ?? null}
              onCocher={(c) => onCocher([v.id], c)}
              onHeureProposee={onHeureProposee}
              gestes={gestes}
              agence={agence}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** La barre de sélection : le compte, les heures proposées des tranches, « Confirmer (n) », « Attribuer ▾ ». */
export function BarreDeSelection({
  n,
  heures,
  enCours,
  agence,
  onConfirmer,
  onAttribuer,
  onDeselectionner,
}: {
  readonly n: number;
  readonly heures: readonly string[];
  readonly enCours: boolean;
  readonly agence: number | null;
  readonly onConfirmer: () => void;
  readonly onAttribuer: (agentId: number) => void;
  readonly onDeselectionner: () => void;
}) {
  const t = useTranslations('visits.parLeTemps.bureau');
  const listeDesHeures =
    heures.length <= 1 ? (heures[0] ?? '') : `${heures.slice(0, -1).join(', ')} ${t('et')} ${heures[heures.length - 1]}`;
  return (
    <div data-slot="barre-de-selection" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-foreground py-2 pr-2 pl-4 text-sm text-background">
      <span className="font-semibold">{t('selection', { n })}</span>
      {heures.length > 0 ? <span className="text-encre-douce-inverse">{t('heuresProposees', { n: heures.length, heures: listeDesHeures })}</span> : null}
      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={enCours}
          onClick={onConfirmer}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-background px-3 font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
        >
          <Check className="size-4" aria-hidden="true" />
          {t('confirmerLot', { n })}
        </button>
        {agence !== null ? (
          <AttribuerA
            agence={agence}
            disabled={enCours}
            onChoisir={onAttribuer}
            declencheur={
              <button type="button" className="inline-flex h-8 items-center gap-1 rounded-lg border border-background/30 px-3 font-medium text-background outline-none focus-visible:ring-3 focus-visible:ring-ring">
                {t('attribuer')}
                <ChevronDown className="size-4 opacity-70" aria-hidden="true" />
              </button>
            }
          />
        ) : null}
        <button type="button" onClick={onDeselectionner} className="h-8 rounded-md px-2 text-encre-douce-inverse outline-none hover:text-background focus-visible:ring-3 focus-visible:ring-ring">
          {t('deselectionner')}
        </button>
      </span>
    </div>
  );
}
