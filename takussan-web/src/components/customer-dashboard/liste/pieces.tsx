'use client';

import { useTranslations } from 'next-intl';
import { CalendarPlus, Phone } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { PIPELINE_STAGE_TONE } from '@/components/customer-form/options';
import { pipelineStageValues } from '@/lib/enums/customer';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initiales } from '@/lib/fiche-publique';
import { nomAffichable } from '@/lib/identite';
import { formaterTelephone } from '@/lib/phone';
import { type CanalDeContactClient } from '@/lib/queries/customer-gestures';
import { jourADakar } from '@/lib/visites/par-le-temps';
import { jourEnClair } from '@/lib/visites/planification';
import { cn } from '@/lib/utils';
import type { CustomerListItem } from '@/types/customer';

/**
 * TCK-2590 — les pièces de la liste des clients (maquette `app-clients` a, « Liste ») : ce qu'une
 * ligne dit d'un client, et ses gestes. La ligne du téléphone et le tableau du bureau les assemblent.
 */

/** Ce qu'une ligne dit d'un client, déjà formulé. */
export interface LectureDuClient {
  readonly nom: string;
  readonly prenom: string;
  readonly initiales: string;
  /** Le téléphone formaté, toujours montré quand il existe ; sinon l'e-mail (TCK-2590). */
  readonly contact: string | null;
  /** La relance due (point rouge) ou la prochaine action ; `null` si rien n'est prévu ou lisible. */
  readonly prochaine: { readonly texte: string; readonly enRetard: boolean } | null;
  /** « Studio, appartement · Mermoz, Ouakam » et « ≤ 250 000 F » (le budget reste entier). */
  readonly cherche: { readonly quoi: string | null; readonly budget: string | null } | null;
}

const minuscule = (s: string) => (s ? s.charAt(0).toLocaleLowerCase() + s.slice(1) : s);
const majuscule = (s: string) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);

/** Le lecteur des lignes : une fonction pure par client, liée à la locale et à la minute courante. */
export function useLecteurDuClient(maintenant: Date) {
  const t = useTranslations('crm.list');
  // Le libellé d'un type est celui du reste du produit (`nav.categories`, déjà servi par la coque).
  const tTypes = useTranslations('nav.categories');
  const f = useFormatteurs();

  const jour = (iso: string) => jourEnClair(jourADakar(new Date(iso)), f.locale);

  const prochaine = (c: CustomerListItem): LectureDuClient['prochaine'] => {
    const r = c.follow_up;
    if (r) {
      if (r.reason === 'report_missing') return { texte: t('relance.report_missing', { jour: jour(r.since) }), enRetard: true };
      if (r.reason === 'overdue_task') return { texte: t('relance.overdue_task', { days: r.days }), enRetard: true };
      return { texte: t('relance.no_contact', { days: r.days }), enRetard: true };
    }
    const a = c.next_action;
    if (!a) return null;
    if (a.type === 'visit') {
      const heure = f.heure(a.at);
      const texte = jourADakar(new Date(a.at)) === jourADakar(maintenant) ? t('prochaine.visiteAujourdhui', { heure }) : t('prochaine.visite', { jour: jour(a.at), heure });
      return { texte, enRetard: a.overdue };
    }
    const titre = a.label?.trim();
    return { texte: titre ? majuscule(titre) : t('prochaine.tache', { jour: jour(a.at) }), enRetard: a.overdue };
  };

  const cherche = (c: CustomerListItem): LectureDuClient['cherche'] => {
    const types = (c.seeking_property_types ?? []).map((x) => (tTypes.has(x) ? tTypes(x) : x));
    const lieux = (c.seeking_neighborhoods?.length ? c.seeking_neighborhoods : c.seeking_cities) ?? [];
    const quoi = [types.length ? types.map((x, i) => (i === 0 ? x : minuscule(x))).join(', ') : null, lieux.length ? lieux.join(', ') : null]
      .filter((x): x is string => Boolean(x))
      .join(' · ');
    const plafond = c.budget_max !== null && c.budget_max !== undefined && c.budget_max !== '' ? f.montantCourt(Number(c.budget_max)) : null;
    const budget = plafond
      ? c.seeking_contract_type === 'sale'
        ? t('cherche.achatPlafond', { montant: plafond })
        : t('cherche.plafond', { montant: plafond })
      : c.seeking_contract_type === 'sale'
        ? t('cherche.achat')
        : null;
    return quoi || budget ? { quoi: quoi || null, budget } : null;
  };

  return (c: CustomerListItem): LectureDuClient => {
    const nom = nomAffichable(c);
    return {
      nom,
      prenom: c.first_name?.trim() || nom,
      initiales: initiales(nom),
      contact: c.phone ? formaterTelephone(c.phone) : (c.email ?? null),
      prochaine: prochaine(c),
      cherche: cherche(c),
    };
  };
}

/** L'étape, en pastille de statut (repli sur le jeton brut pour une valeur inconnue). */
export function EtapeDuClient({ stage }: { readonly stage: CustomerListItem['pipeline_stage'] }) {
  const t = useTranslations('crm.pipeline.stage');
  if (!stage) return <span className="text-muted-foreground">—</span>;
  const label = (pipelineStageValues as readonly string[]).includes(stage) ? t(stage) : stage;
  return <StatusBadge label={label} tone={PIPELINE_STAGE_TONE[stage] ?? 'neutral'} />;
}

/**
 * Les initiales d'un client, en pastille ronde (`taille` : 44 au téléphone, 32 au bureau ; 52 en tête
 * de la fiche au téléphone, TCK-2589).
 */
export function InitialesDuClient({ texte, taille }: { readonly texte: string; readonly taille: 32 | 44 | 52 }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full bg-fond-avatar font-semibold text-encre-avatar',
        // L'avatar de la maquette (`Math.round(taille × 0,36)`) : 32 → 12 px, 44 → 16, 52 → 19. Les jetons de la
        // primitive (`size-avatar-N`, `text-avatar-N`) sont en rem fixes : ni la densité ×0,9 du bureau ni un
        // pas calculé ne s'en mêlent. Pas de primitive Avatar ici : son liseré (`after:border`) n'est pas
        // dans la maquette.
        taille === 52 ? 'size-avatar-52 text-avatar-52' : taille === 44 ? 'size-avatar-44 text-avatar-44' : 'size-avatar-32 text-avatar-32',
      )}
    >
      {texte}
    </span>
  );
}

const GESTE = 'inline-flex flex-none items-center justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring';
const TON_WHATSAPP = 'bg-success text-success-foreground hover:bg-success/90';
const TON_CONTOUR = 'border border-border bg-card text-foreground hover:bg-muted';

interface GestesProps {
  readonly client: CustomerListItem;
  readonly lecture: LectureDuClient;
  /**
   * Le personnel : le geste est enregistré (`POST …/contacts`) par la liste, qui porte la mutation et
   * DIT son échec (P228.06) ; le bailleur appelle sans trace (absent).
   */
  readonly noter?: (channel: CanalDeContactClient) => void;
  /** `rond` : 44 px au téléphone ; `petit` : 28 px au survol d'une ligne du bureau. */
  readonly forme: 'rond' | 'petit';
  /** Bureau, personnel : « Planifier une visite », la feuille de TCK-2586 avec le client posé. */
  readonly onPlanifier?: () => void;
}

/** Appeler et WhatsApp (et, au bureau, Planifier) : un numéro joignable seulement (`isReachable`). */
export function GestesDuClient({ client, lecture, noter: enregistrer, forme, onPlanifier }: GestesProps) {
  const t = useTranslations('agentCrm.contact');
  const tListe = useTranslations('crm.list.gestes');
  const phone = client.phone;
  if (!isReachable(phone)) return null;
  const noter = (channel: CanalDeContactClient) => {
    enregistrer?.(channel);
  };
  const classe = (teinte: string) => cn(GESTE, teinte, forme === 'rond' ? 'size-11 rounded-full' : 'size-7 rounded-md');
  const icone = forme === 'rond' ? 'size-icone' : 'size-3.5';
  return (
    <>
      <a href={telHref(phone)} onClick={() => noter('call')} aria-label={t('callAria', { name: lecture.nom })} data-slot="geste-appeler" className={classe(TON_CONTOUR)}>
        <Phone className={icone} strokeWidth={1.75} aria-hidden="true" />
      </a>
      <a
        href={whatsappHref(phone, t('whatsappMessage', { firstName: lecture.prenom }))}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => noter('whatsapp')}
        aria-label={t('whatsappAria', { name: lecture.nom })}
        data-slot="geste-whatsapp"
        className={classe(TON_WHATSAPP)}
      >
        <IconeWhatsApp className={icone} />
      </a>
      {onPlanifier ? (
        <button type="button" onClick={onPlanifier} aria-label={tListe('planifierAria', { name: lecture.nom })} data-slot="geste-planifier" className={classe(TON_CONTOUR)}>
          <CalendarPlus className={icone} aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}
