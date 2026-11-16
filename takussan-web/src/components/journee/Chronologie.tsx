'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Navigation, Phone, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { compteARebours, prochaineVisite, type Moment } from '@/lib/journee/journee';
import { lienItineraire, nomDuVisiteur, telephoneDuVisiteur } from '@/components/visits/par-le-temps/pieces';
import { finDeLaVisite } from '@/lib/visites/par-le-temps';
import { cn } from '@/lib/utils';
import type { PropertyVisit } from '@/types/visit';
import { MenuReporter, type GestesDeLaJournee } from './ARegler';
import { Cocher, GESTE, GESTE_CONTOUR, ROND } from './pieces';

const MINUTE = 60_000;

function TypeEvenement({ type }: { readonly type: 'visite' | 'tache' }) {
  const t = useTranslations('journee.chronologie');
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', type === 'visite' ? 'text-primary-deep' : 'text-encre-douce')}>
      <span className={cn('size-2 rounded-full', type === 'visite' ? 'bg-primary' : 'bg-foreground')} aria-hidden="true" />
      {t(type)}
    </span>
  );
}

/** Appeler et WhatsApp d'un contact joignable, en disques (le vert plein pour WhatsApp). */
function GestesDuContact({ telephone, nom, message }: { readonly telephone: string | null; readonly nom: string; readonly message: string }) {
  const t = useTranslations('journee.chronologie');
  if (!telephone) return null;
  return (
    <>
      <a href={telHref(telephone)} aria-label={t('appeler', { nom })} className={cn(ROND, 'border border-border bg-card text-foreground hover:bg-muted')}>
        <Phone className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
      </a>
      <a href={whatsappHref(telephone, message)} target="_blank" rel="noopener noreferrer" aria-label={t('whatsapp', { nom })} className={cn(ROND, 'bg-success text-success-foreground')}>
        <IconeWhatsApp className="size-4.5" />
      </a>
    </>
  );
}

/**
 * TCK-2792 — le titre est un lien ÉTIRÉ sur la tête de la carte (« Visite », titre, adresse, visiteur), comme celui
 * des cartes de baux : sa zone de frappe est la tête, pas la ligne de texte (20,6 px). Itinéraire, Appeler et
 * WhatsApp sont hors de la tête.
 */
function CarteVisite({ v }: { readonly v: PropertyVisit }) {
  const t = useTranslations('journee.chronologie');
  const tJ = useTranslations('journee');
  const nom = nomDuVisiteur(v);
  const titre = v.property?.title?.trim() || tJ('bienSansTitre');
  const quartier = v.property?.address?.neighborhood?.trim();
  const adresse = v.property?.address?.line?.trim();
  const itineraire = lienItineraire(v);
  return (
    <div data-slot="carte-visite" className="rounded-xl border border-border bg-card p-3.5 xl:flex xl:items-center xl:gap-4">
      <div className="relative min-w-0 flex-1">
        <TypeEvenement type="visite" />
        <Link
          href={`/app/visits/${v.id}`}
          className="mt-1 block text-corps font-semibold leading-snug outline-none after:absolute after:inset-0 hover:underline focus-visible:underline"
        >
          {quartier && !titre.toLocaleLowerCase().includes(quartier.toLocaleLowerCase()) ? `${titre} · ${quartier}` : titre}
        </Link>
        {adresse || nom ? <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{[adresse, nom].filter(Boolean).join(' · ')}</p> : null}
      </div>
      {/* TCK-2856 — entre 1024 et 1280 (deux colonnes dès `lg`), la carte n'a que ~185 px utiles : Itinéraire (~114 px)
          et les deux disques (2 × 44 px) passent à la ligne au lieu d'être rognés par la section. */}
      <div className="mt-3 flex flex-wrap gap-2 xl:mt-0 xl:flex-none xl:flex-nowrap">
        {itineraire ? (
          <a href={itineraire} target="_blank" rel="noopener noreferrer" className={cn(GESTE, GESTE_CONTOUR, 'flex-1 xl:flex-none')}>
            <Navigation className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {t('itineraire')}
          </a>
        ) : null}
        <GestesDuContact telephone={telephoneDuVisiteur(v)} nom={nom ?? t('visiteur')} message={t('messageVisite', { nom: nom ?? '', bien: titre })} />
      </div>
    </div>
  );
}

function CarteTache({ moment, gestes }: { readonly moment: Extract<Moment, { genre: 'tache' }>; readonly gestes: GestesDeLaJournee }) {
  const t = useTranslations('journee.chronologie');
  const tA = useTranslations('journee.aRegler');
  const { tache } = moment;
  const cible = tache.cible;
  const reference = { id: tache.id, titre: tache.titre };
  const telephone = cible?.type === 'customer' && isReachable(cible.phone) ? cible.phone : null;
  return (
    <div data-slot="carte-tache" className="flex items-center gap-1 rounded-xl border border-border bg-card py-2 pl-1 pr-3.5 max-xl:flex-wrap">
      <Cocher faite={tache.faite} libelle={tA('marquerFaite', { titre: tache.titre })} disabled={gestes.enCours === tache.id} onClick={() => gestes.onCocher(reference, !tache.faite)} />
      <div className="min-w-0 flex-1 max-xl:basis-48">
        <TypeEvenement type="tache" />
        <p className={cn('text-corps font-semibold leading-snug', tache.faite && 'text-muted-foreground line-through')}>{tache.titre}</p>
        {cible?.label ? <p className="truncate text-sm text-muted-foreground">{cible.label}</p> : null}
      </div>
      {tache.faite ? null : <MenuReporter tache={reference} gestes={gestes} className="mr-1 max-md:hidden" />}
      <GestesDuContact telephone={telephone} nom={cible?.label ?? ''} message={t('messageTache', { nom: cible?.label ?? '' })} />
    </div>
  );
}

/**
 * `sousBureau` (TCK-2856) : ce que la ligne dit sous l'heure AU BUREAU quand il diffère du téléphone — le
 * compte à rebours de la prochaine visite (maquette `app-aujourdhui` e0 : « dans 45 min » au bureau, la
 * durée au téléphone). La chronologie est un seul nœud rendu dans les deux blocs : la bascule est en CSS.
 */
function Ligne({ heure, sous, sousBureau, children }: { readonly heure: string; readonly sous?: string | null; readonly sousBureau?: string | null; readonly children: ReactNode }) {
  return (
    <li className="flex gap-3 px-4 md:px-5">
      <div className="w-13 flex-none pt-3.5 md:w-19">
        <p className="font-display text-lg font-semibold leading-none tabular-nums">{heure}</p>
        {sousBureau ? (
          <>
            {sous ? <p className="mt-1.5 text-xs text-muted-foreground md:hidden">{sous}</p> : null}
            <p data-slot="compte-a-rebours" className="mt-1.5 text-xs text-muted-foreground max-md:hidden">
              {sousBureau}
            </p>
          </>
        ) : sous ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{sous}</p>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pb-3">{children}</div>
    </li>
  );
}

interface ChronologieProps {
  readonly moments: readonly Moment[];
  /** Aujourd'hui : la ligne « maintenant » se pose entre le passé et ce qui vient. */
  readonly maintenant: Date | null;
  readonly gestes: GestesDeLaJournee;
  readonly onPlanifier: (heure: string) => void;
}

/**
 * La chronologie (maquette `Chronologie`) : ce qui a une heure, dans l'ordre — visites (Itinéraire,
 * Appeler, WhatsApp) et tâches (cocher, Reporter) — avec « maintenant » et le temps libre d'au moins
 * une heure entre deux visites.
 */
export function Chronologie({ moments, maintenant, gestes, onPlanifier }: ChronologieProps) {
  const t = useTranslations('journee.chronologie');
  const f = useFormatteurs();
  const lignes: ReactNode[] = [];
  // TCK-2856 — la prochaine visite d'aujourd'hui dit dans combien de temps elle commence ; passée, sa durée.
  const prochaine = maintenant ? prochaineVisite(moments, maintenant) : null;
  const rebours = prochaine && maintenant ? compteARebours(prochaine.instant, maintenant) : null;
  const dans = rebours ? (rebours.heures === 0 ? t('dansMinutes', { n: rebours.minutes }) : t('dansHeures', { h: rebours.heures, m: String(rebours.minutes).padStart(2, '0'), minutes: rebours.minutes })) : null;
  let maintenantPose = maintenant === null;
  const poserMaintenant = () => {
    if (maintenantPose || !maintenant) return;
    maintenantPose = true;
    lignes.push(
      <li key="maintenant" data-slot="maintenant" className="flex items-center gap-3 px-4 pb-2 md:px-5">
        <span className="w-13 flex-none text-xs font-semibold tabular-nums text-primary md:w-19">{f.heure(maintenant)}</span>
        <span className="h-px flex-1 bg-primary/50" aria-hidden="true" />
        <span className="text-xs font-medium text-primary">{t('maintenant')}</span>
      </li>,
    );
  };

  moments.forEach((m, i) => {
    if (maintenant && m.instant >= maintenant.getTime()) poserMaintenant();
    if (m.genre === 'visite') {
      const duree = m.visite.duration_minutes && m.visite.duration_minutes > 0 ? m.visite.duration_minutes : null;
      lignes.push(
        <Ligne key={`v-${m.visite.id}`} heure={f.heure(m.visite.scheduled_at)} sous={duree ? t('duree', { n: duree }) : null} sousBureau={m === prochaine ? dans : null}>
          <CarteVisite v={m.visite} />
        </Ligne>,
      );
      // Le temps libre jusqu'au moment suivant, quand c'est une visite et qu'il dure au moins une heure.
      const suivant = moments[i + 1];
      const fin = finDeLaVisite(m.visite);
      if (suivant?.genre === 'visite' && fin !== null) {
        const des = Math.ceil(fin / (15 * MINUTE)) * 15 * MINUTE;
        if (suivant.instant - des >= 60 * MINUTE) {
          const heureDes = f.heure(new Date(des));
          lignes.push(
            <Ligne key={`libre-${m.visite.id}`} heure={heureDes}>
              <div className="flex h-11 items-center gap-2 rounded-xl border border-dashed border-foreground/20 px-3.5 text-sm text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">{t('libreJusqua', { heure: f.heure(new Date(suivant.instant)) })}</span>
                <button type="button" onClick={() => onPlanifier(heureDes)} className="-my-2 inline-flex h-11 items-center gap-1 font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring">
                  <Plus className="size-4" aria-hidden="true" />
                  {t('planifier')}
                </button>
              </div>
            </Ligne>,
          );
        }
      }
    } else {
      lignes.push(
        <Ligne key={`t-${m.tache.id}`} heure={f.heure(m.tache.echeance)}>
          <CarteTache moment={m} gestes={gestes} />
        </Ligne>,
      );
    }
  });
  poserMaintenant();

  return <ol data-slot="chronologie">{lignes}</ol>;
}
