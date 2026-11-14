'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, ChevronDown, ChevronRight, CircleDashed, Inbox, Loader2, MapPin, Phone, ShieldCheck } from 'lucide-react';

import { BOUTON_D_ENTREE, BoutonCollant } from '@/components/auth/BoutonCollant';
import { ZoneMultiSelect } from '@/components/agents/ZoneMultiSelect';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { agentUpdateSpecializationAction, getAgentFirstLeadAction } from '@/app/actions/agent-onboarding';
import { useAgentRoleCapabilities } from '@/hooks/useCan';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import type { AgentFirstLeadEntry, AgentSpecializationPayload } from '@/lib/agent-onboarding';
import { aDonner, type PieceDuProfil } from '@/lib/pieces/pieces';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';

import { NumeroVerifie, TitreDInvite } from './pieces';

/**
 * TCK-2613 — l'écran 2 de l'agent invité : « Bienvenue dans l'équipe, {prénom} » (maquette `app-entree-assistants`,
 * approche a, « Agent : ton premier prospect »). Le premier prospect pré-assigné en tête (ou « Pas encore de
 * prospect pour vous »), « Vos zones » et la spécialisation éditables d'UN geste, les droits donnés par l'agence
 * repliés. La carte professionnelle, la pièce d'identité et la photo sont parties dans « Pièces » (TCK-2614).
 *
 * ⚠ **Le numéro de carte n'est jamais effacé ici.** Le `PATCH …/specialization` lit une clé `license_number`
 * absente comme « garder » et `null` comme « effacer » (TCK-1779) ; l'assistant d'avant l'envoyait toujours, vide
 * compris. Il ne part plus : la carte se saisit dans « Pièces ».
 *
 * ⚠ Chaque sortie finalise d'abord (`onAller`) : le profil est encore `draft`.
 */
export type Specialisation = AgentSpecializationPayload['specialization'];
export const SPECIALISATIONS: readonly Specialisation[] = ['residential', 'commercial', 'luxury', 'mixed'];

export interface ZonesDeLAgent {
  readonly specialisation: Specialisation | '';
  readonly zones: readonly string[];
}

interface ProspectDeLAgentProps {
  readonly agentProfileId: number;
  readonly agence: string | null;
  readonly prenom: string | null;
  readonly telephone: string | null;
  /** Ce qui est enregistré (spécialisation du profil, zones saisies) — gardé au brouillon. */
  readonly zones: ZonesDeLAgent;
  readonly onZones: (zones: ZonesDeLAgent) => void;
  /** Les pièces du profil (`GET /api/me/pieces`) ; `null` si la lecture a échoué — aucun rappel alors. */
  readonly pieces: readonly PieceDuProfil[] | null;
  readonly onAller: (href: string) => void;
  readonly enCours: boolean;
}

const PIECES_DE_L_AGENT = ['license', 'cni', 'photo'] as const;

const ETAPES = new Set(['lead', 'prospect', 'qualified', 'negotiating', 'converted', 'lost']);
const CIBLE = 'rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';

function grouperCapacites(capacites: readonly string[]): ReadonlyArray<readonly [string, string[]]> {
  const groupes = new Map<string, string[]>();
  for (const capacite of capacites) {
    const domaine = capacite.split('.')[0] ?? capacite;
    groupes.set(domaine, [...(groupes.get(domaine) ?? []), capacite]);
  }
  return [...groupes.entries()];
}

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m.charAt(0).toUpperCase())
    .join('');
}

function chiffres(telephone: string): string {
  return telephone.replace(/\D+/g, '');
}

export function ProspectDeLAgent({ agentProfileId, agence, prenom, telephone, zones, onZones, pieces, onAller, enCours }: ProspectDeLAgentProps) {
  const t = useTranslations('onboarding.invite.agent');
  const decalage = useDecalageDuClavier();
  // `undefined` : en lecture ; `null` : aucun prospect confié ; `'erreur'` : la lecture a échoué — ce n'est pas
  // « pas de prospect », et l'écran ne le dit pas.
  const [prospect, setProspect] = useState<AgentFirstLeadEntry | null | 'erreur' | undefined>(undefined);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const res = await getAgentFirstLeadAction(agentProfileId);
      if (annule) return;
      setProspect(res.ok ? res.data.customer : 'erreur');
    })();
    return () => {
      annule = true;
    };
  }, [agentProfileId]);

  const fort = (m: ReactNode) => <span className="font-semibold text-foreground">{m}</span>;
  // Le rappel ne nomme que ce qui reste à ajouter, lu de l'API — jamais une liste écrite d'avance.
  const aAjouter = PIECES_DE_L_AGENT.filter((code) => (pieces ?? []).some((p) => p.code === code && p.required && aDonner(p)));
  const noms = aAjouter.map((code) => t(`pieces.${code}`));
  const liste = noms.length > 1 ? t('et', { debut: noms.slice(0, -1).join(', '), fin: noms[noms.length - 1] }) : (noms[0] ?? '');
  const lien = cn('inline-flex min-h-11 items-center text-sm font-medium text-primary underline decoration-1 underline-offset-4 disabled:opacity-50', CIBLE);

  /*
   * UNE seule instance de chaque bloc, placée par la grille : au téléphone, le prospect, les zones et les droits,
   * le rappel, le geste collé en bas ; de `lg` à `xl`, le geste suit le prospect et les zones passent dessous
   * (maquette) ; dès `xl`, les zones et les droits passent dans la colonne voisine. Deux copies cachées tour à
   * tour auraient deux états d'édition des zones.
   */
  return (
    <div className="mx-auto grid w-full grid-cols-1 lg:max-w-[37.5rem] xl:max-w-none xl:grid-cols-[minmax(0,37.5rem)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:gap-x-14">
      <div className="min-w-0 xl:col-start-1 xl:row-start-1">
        <NumeroVerifie telephone={telephone} />
        <TitreDInvite className="mt-4 lg:mt-5">{prenom ? t('titre', { prenom }) : t('titreSans')}</TitreDInvite>

        {prospect === undefined ? (
          <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t('chargement')}
          </p>
        ) : prospect === null || prospect === 'erreur' ? (
          <>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground lg:mt-3 lg:text-base">
              {agence ? t('sansProspect.texteCourt', { agence }) : t('sansProspect.texteCourtSans')}
            </p>
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-card p-4" data-testid="agent-sans-prospect">
              <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                {prospect === 'erreur' ? (
                  <p role="alert" className="text-sm text-destructive">
                    {t('prospect.erreur')}
                  </p>
                ) : (
                  <>
                    <p className="text-[0.9375rem] font-semibold">{t('sansProspect.titre')}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t('sansProspect.texte')}</p>
                  </>
                )}
                <button type="button" disabled={enCours} onClick={() => onAller('/app/leads')} className={cn('mt-1', lien)}>
                  {t('sansProspect.demandes')}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground lg:mt-3 lg:text-base">
              {agence ? t('texte', { agence }) : t('texteSans')}
            </p>
            <CarteProspect prospect={prospect} enCours={enCours} onFiche={() => onAller(`/app/customers/${prospect.id}`)} />
            <p className="flex justify-end lg:hidden">
              <button type="button" disabled={enCours} onClick={() => onAller(`/app/customers/${prospect.id}`)} className={lien}>
                {t('prospect.voirLaFiche')}
              </button>
            </p>
          </>
        )}
      </div>

      <aside className="mt-3 min-w-0 space-y-6 lg:order-3 lg:mt-8 lg:space-y-4 xl:order-none xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:mt-0 xl:pt-13">
        <ZonesEtSpecialisation agentProfileId={agentProfileId} zones={zones} onZones={onZones} className="lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-5" />
        <Droits agentProfileId={agentProfileId} />
      </aside>

      <div className="min-w-0 lg:order-2 xl:order-none xl:col-start-1 xl:row-start-2">
        {aAjouter.length > 0 ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-muted/70 p-3.5 lg:hidden" data-testid="rappel-des-pieces">
            <span className="mt-0.5 inline-flex size-8 flex-none items-center justify-center rounded-full bg-card text-muted-foreground">
              <CircleDashed className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-foreground">{t.rich('rappel', { compte: aAjouter.length, liste, fort })}</p>
          </div>
        ) : null}
        <BoutonCollant decalage={decalage} className="lg:mt-8">
          <div className="lg:flex lg:items-center lg:gap-4">
            <Button type="button" disabled={enCours} onClick={() => onAller('/app')} className={cn(BOUTON_D_ENTREE, 'lg:w-auto lg:flex-none')}>
              {enCours ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t('ouverture')}
                </>
              ) : (
                <>
                  {t('allerAMonEspace')}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
            {aAjouter.length > 0 ? <p className="hidden text-sm text-muted-foreground lg:block">{t('rappelBureau', { liste })}</p> : null}
          </div>
        </BoutonCollant>
      </div>
    </div>
  );
}

function CarteProspect({ prospect, enCours, onFiche }: { readonly prospect: AgentFirstLeadEntry; readonly enCours: boolean; readonly onFiche: () => void }) {
  const t = useTranslations('onboarding.invite.agent');
  const etape = prospect.pipeline_stage && ETAPES.has(prospect.pipeline_stage) ? t(`etapes.${prospect.pipeline_stage}`) : null;
  const tel = prospect.phone ? chiffres(prospect.phone) : null;
  return (
    <div
      data-testid={`agent-first-lead-${prospect.id}`}
      className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_14px_32px_-22px_color-mix(in_oklab,var(--shadow-color)_45%,transparent)] lg:mt-7"
    >
      <div className="p-4 lg:p-6">
        <p className="text-xs font-medium text-muted-foreground">{t('prospect.surtitre')}</p>
        <div className="mt-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary-deep lg:size-13 lg:text-base"
          >
            {initiales(prospect.full_name)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-base font-semibold lg:text-lg">{prospect.full_name}</p>
            {prospect.phone ? <p className="truncate text-[0.8125rem] tabular-nums text-muted-foreground">{formaterTelephone(prospect.phone)}</p> : null}
          </div>
          {etape ? (
            <span className="inline-flex h-6 flex-none items-center whitespace-nowrap rounded-full bg-warning/20 px-2 text-xs font-medium text-foreground">{etape}</span>
          ) : null}
        </div>
      </div>
      {tel ? (
        <div className="flex items-center gap-2 border-t border-border bg-background/60 px-4 py-3 lg:px-6">
          <a
            href={`tel:+${tel}`}
            className={cn('inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground', CIBLE)}
          >
            <Phone className="size-4" aria-hidden="true" />
            {t('prospect.appeler')}
          </a>
          <a
            href={`https://wa.me/${tel}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-foreground/20 bg-card px-5 text-sm font-semibold text-foreground', CIBLE)}
          >
            {t('prospect.whatsapp')}
          </a>
          <button
            type="button"
            disabled={enCours}
            onClick={onFiche}
            className={cn('hidden h-11 flex-none items-center gap-1 pl-2 text-sm font-medium text-primary disabled:opacity-50 lg:inline-flex', CIBLE)}
          >
            {t('prospect.voirLaFiche')}
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="hidden border-t border-border bg-background/60 px-6 py-3 lg:flex lg:justify-end">
          <button type="button" disabled={enCours} onClick={onFiche} className={cn('inline-flex h-11 items-center gap-1 text-sm font-medium text-primary disabled:opacity-50', CIBLE)}>
            {t('prospect.voirLaFiche')}
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function ZonesEtSpecialisation({
  agentProfileId,
  zones,
  onZones,
  className,
}: {
  readonly agentProfileId: number;
  readonly zones: ZonesDeLAgent;
  readonly onZones: (zones: ZonesDeLAgent) => void;
  readonly className?: string;
}) {
  const t = useTranslations('onboarding.invite.agent.zones');
  const tSpec = useTranslations('agents.onboarding.steps.specialization');
  const id = useId();
  const [edition, setEdition] = useState<ZonesDeLAgent | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ readonly ton: 'ok' | 'erreur'; readonly texte: string } | null>(null);

  async function enregistrer() {
    if (!edition) return;
    if (edition.specialisation === '') {
      setMessage({ ton: 'erreur', texte: t('specialisationRequise') });
      return;
    }
    setEnvoi(true);
    setMessage(null);
    try {
      // Sans `license_number` : clé absente = numéro de carte gardé (TCK-1779).
      const res = await agentUpdateSpecializationAction(agentProfileId, {
        specialization: edition.specialisation,
        intervention_zones: [...edition.zones],
      });
      if (!res.ok) {
        setMessage({ ton: 'erreur', texte: res.message });
        return;
      }
      // Ce que l'API a gardé (zones nettoyées, doublons retirés), pas la saisie.
      onZones({ specialisation: edition.specialisation, zones: res.data.intervention_zones ?? [...edition.zones] });
      setEdition(null);
      setMessage({ ton: 'ok', texte: t('enregistre') });
    } finally {
      setEnvoi(false);
    }
  }

  const affichees = edition ?? zones;

  return (
    <section className={className} aria-labelledby={`${id}-titre`}>
      <div className="flex items-baseline justify-between">
        <h2 id={`${id}-titre`} className="text-[0.9375rem] font-semibold">
          {t('titre')}
        </h2>
        {edition ? null : (
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setEdition(zones);
            }}
            className={cn('inline-flex min-h-11 items-center text-sm font-medium text-primary', CIBLE)}
          >
            {t('modifier')}
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{affichees.zones.length > 0 ? t('texte') : t('aucune')}</p>

      {edition ? (
        <div className="mt-3 flex flex-col gap-4">
          <ZoneMultiSelect
            labelHtmlFor={`${id}-zones`}
            value={[...edition.zones]}
            onChange={(liste) => setEdition({ ...edition, zones: liste })}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-specialisation`}>{t('specialisation')}</Label>
            <Select
              value={edition.specialisation || ''}
              onValueChange={(valeur) => setEdition({ ...edition, specialisation: (valeur ?? '') as Specialisation | '' })}
              items={SPECIALISATIONS.map((s) => ({ value: s, label: tSpec(`specializationValues.${s}`) }))}
            >
              <SelectTrigger id={`${id}-specialisation`} className="w-full">
                <SelectValue placeholder={tSpec('specializationPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {SPECIALISATIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tSpec(`specializationValues.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => void enregistrer()} disabled={envoi} className="h-11 rounded-full px-5">
              {envoi ? t('enregistrement') : t('enregistrer')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEdition(null)} disabled={envoi} className="h-11 rounded-full px-4">
              {t('annuler')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {zones.zones.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {zones.zones.map((zone) => (
                <li key={zone} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium">
                  <MapPin className="size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                  {zone}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('specialisation')}</span>
            <span className="font-medium">
              {zones.specialisation ? tSpec(`specializationValues.${zones.specialisation}`) : t('specialisationAucune')}
            </span>
          </p>
        </>
      )}
      {message ? (
        <p role={message.ton === 'erreur' ? 'alert' : 'status'} className={cn('mt-2 text-[0.8125rem]', message.ton === 'erreur' ? 'text-destructive' : 'text-success')}>
          {message.texte}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Les droits que le RÔLE de ce profil accordera (`GET /api/me/agent-profiles/{id}/role-capabilities`, TCK-589) :
 * le profil est encore `draft`, `GET /api/me/capabilities` serait vide.
 */
function Droits({ agentProfileId, className }: { readonly agentProfileId: number; readonly className?: string }) {
  const t = useTranslations('onboarding.invite.agent.droits');
  const tAccueil = useTranslations('agents.onboarding.steps.welcome');
  const tRoles = useTranslations('admin.roles');
  const requete = useAgentRoleCapabilities(agentProfileId);
  const capacites = requete.data?.data.capabilities ?? [];
  const groupes = grouperCapacites(capacites);
  // Repliés au téléphone, ouverts au bureau (maquette) — tant que la personne n'a pas choisi.
  const bureau = useMatchesMedia('(min-width: 64rem)');
  const [choix, setChoix] = useState<boolean | null>(null);
  const deplie = choix ?? bureau;
  const id = useId();

  return (
    <div className={cn('rounded-2xl border border-border bg-card', className)} data-testid="agent-capabilities">
      <button
        type="button"
        aria-expanded={deplie}
        aria-controls={`${id}-liste`}
        onClick={() => setChoix(!deplie)}
        className={cn('flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left lg:px-5', CIBLE)}
      >
        <ShieldCheck className="size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[0.9375rem] font-semibold">{t('titre')}</span>
          {requete.isLoading || requete.isError ? null : (
            <span className="block text-[0.8125rem] text-muted-foreground">{t('compte', { compte: capacites.length })}</span>
          )}
        </span>
        <ChevronDown className={cn('size-5 flex-none text-muted-foreground transition-transform', deplie && 'rotate-180')} aria-hidden="true" />
      </button>
      <div id={`${id}-liste`} hidden={!deplie} className="border-t border-border px-4 pb-4 pt-3 lg:px-5">
        {requete.isLoading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : requete.isError ? (
          <p className="text-sm text-destructive">{tAccueil('capabilitiesError')}</p>
        ) : groupes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tAccueil('capabilitiesEmpty')}</p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {groupes.map(([domaine, liste]) => {
                const nom = tRoles.has(`domains.${domaine}`) ? tRoles(`domains.${domaine}`) : domaine;
                return (
                  <section key={domaine} aria-label={nom}>
                    <h3 className="text-sm font-semibold text-foreground">{nom}</h3>
                    <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                      {liste.map((capacite) => (
                        <li key={capacite} className="flex items-start gap-2">
                          <span className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
                          <span>{tRoles.has(`capabilities.${capacite}`) ? tRoles(`capabilities.${capacite}`) : capacite}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
            <p className="mt-4 border-t border-border pt-3 text-[0.8125rem] text-muted-foreground">{t('pied')}</p>
          </>
        )}
      </div>
    </div>
  );
}
