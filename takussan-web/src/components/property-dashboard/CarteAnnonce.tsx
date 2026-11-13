'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, Rocket } from 'lucide-react';

import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import type { Locale } from '@/i18n/config';
import { etatDAnnonce, statutAMontrer, type EtatDAnnonce } from '@/lib/biens/etat-d-annonce';
import { phrasesDesMotifs } from '@/lib/biens/motifs-hors-ligne';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PropertyListItem } from '@/types/property';

import { MontantDuBien, lieuDuBien } from './GestionDuBien';
import { PropertyRowActions } from './PropertyRowActions';
import { PropertyStatusBadge } from './PropertyStatusBadge';
import { ProprietaireEtResponsable } from './ProprietaireEtResponsable';

/**
 * TCK-2638 (lot B) — la carte du mode Annonces (maquette `app-biens` a-1) : la photo en 3:2, le prix
 * avec sa période (AC7), le titre · quartier, l'état d'annonce (« En ligne » = `is_online`, ADR-0097)
 * et la visibilité (« Public / Privé », un réglage), puis les vues et les favoris.
 *
 * **Rien ne se perd** (Contraintes strictes du ticket) : la carte garde ce que portait la ligne d'avant
 * — propriétaire et agent responsable, référence, ancienneté, le statut quand l'état ne le dit pas, le
 * « ⋯ » (Modifier, Publier / Dépublier, Dupliquer, Booster, statut, Archiver, Supprimer) et la case de
 * sélection des actions groupées, HORS de la photo, avec sa cible de 44 px. La carte ENTIÈRE ouvre le
 * bien (lien étiré) ; le « ⋯ » et la case passent au-dessus.
 */
const TON: Readonly<Record<EtatDAnnonce, StatusTone>> = {
  enLigne: 'success',
  aValider: 'attention',
  brouillon: 'neutral',
  horsLigne: 'neutral',
};

export function CarteAnnonce({
  property,
  currentUserId,
  selectionne,
  onBasculer,
  libelleCase,
  maintenant,
}: {
  readonly property: PropertyListItem;
  readonly currentUserId?: number;
  readonly selectionne: boolean;
  readonly onBasculer: () => void;
  readonly libelleCase: string;
  /** L'instant de référence de la liste (un seul pour toutes les cartes) : juge un boost en cours. */
  readonly maintenant: Date;
}) {
  const t = useTranslations('property.dashboard.annonces');
  const fmt = useFormatteurs();
  const finDuBoost = boostEnCours(property, maintenant);
  const tListe = useTranslations('property.dashboard.list');
  const tVisibilite = useTranslations(PROPERTY_ENUM_NAMESPACES.visibilityScope);
  const lieu = lieuDuBien(property);
  const etat = etatDAnnonce(property);
  return (
    <li
      data-testid="carte-annonce"
      className={cn(
        'relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card',
        selectionne && 'ring-2 ring-primary/50',
      )}
    >
      <div className="relative aspect-3/2 bg-muted">
        {property.main_photo_url ? (
          <Image
            src={property.main_photo_url}
            alt=""
            fill
            sizes="(min-width: 80rem) 33vw, (min-width: 64rem) 50vw, 100vw"
            className="object-cover"
          />
        ) : null}
        {/* TCK-2638 (lot B2) — « Boostée » : la mise en avant payée EN COURS (décision du porteur). */}
        {finDuBoost ? (
          <span
            data-testid="boostee"
            className="absolute top-3 left-3 inline-flex h-6 items-center gap-1 rounded-full bg-card px-2 text-xs font-medium"
          >
            <Rocket aria-hidden="true" strokeWidth={1.75} className="size-3.5 text-primary" />
            {t('boostee', { date: fmt.jourMois(finDuBoost, maintenant) })}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold tracking-tight">
              <MontantDuBien property={property} classePeriode="font-sans text-sm tracking-normal" />
            </p>
            <Link
              href={`/app/properties/${property.id}`}
              className="mt-0.5 line-clamp-2 text-corps text-foreground outline-none after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:after:ring-3 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            >
              {lieu ? `${property.title} · ${lieu}` : property.title}
            </Link>
          </div>
          <div className="relative z-10 -mt-1 -mr-1.5 shrink-0">
            <PropertyRowActions property={property} layout="menu" />
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {etat ? (
            <StatusBadge
              tone={TON[etat]}
              icon={etat === 'enLigne' ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : undefined}
              label={t(`etat.${etat}`)}
              data-testid="etat-d-annonce"
            />
          ) : null}
          {property.visibility ? (
            <StatusBadge tone="neutral" label={tVisibilite(property.visibility === 'public' ? 'public' : 'private')} />
          ) : null}
          {statutAMontrer(property) ? <PropertyStatusBadge status={property.status} /> : null}
        </div>
        {etat === 'horsLigne' && property.offline_reasons?.length ? <MotifDeLaCarte motifs={property.offline_reasons} /> : null}
        {/* Les deux noms se lisent entiers : la ligne passe à la ligne plutôt que de couper « Agent responsable : S… »
            (balayage du lot B, 390 et 1280 px). */}
        <ProprietaireEtResponsable property={property} currentUserId={currentUserId} className="mt-2 whitespace-normal" />
        <p className="mt-1 mb-3 text-xs text-muted-foreground tabular-nums">
          {property.reference_number ? <span className="font-medium text-foreground">{tListe('reference', { value: property.reference_number })}</span> : null}
          {property.reference_number ? ' · ' : null}
          <DateRelative value={property.created_at} />
        </p>
        {/* Le pied se pose en bas de la carte (`mt-auto`) : dans la grille du bureau, les cartes d'une rangée
            ont la même hauteur, et leurs chiffres s'alignent. La case garde sa cible de 44 px (`-my-2`). */}
        <div className="mt-auto flex items-center gap-1.5 border-t border-border pt-0.5 text-ui text-muted-foreground tabular-nums">
          <Eye className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {t('chiffres', { vues: property.views_count ?? 0, favoris: property.favorites_count ?? 0 })}
          </span>
          <label className="relative z-10 -my-1.5 -mr-2.5 grid size-11 shrink-0 cursor-pointer place-items-center">
            <input
              type="checkbox"
              aria-label={libelleCase}
              checked={selectionne}
              onChange={onBasculer}
              className="size-5 cursor-pointer rounded-md accent-primary"
            />
          </label>
        </div>
      </div>
    </li>
  );
}

/**
 * TCK-2638 (lot B2) — un boost est EN COURS quand `sponsored_until` est après l'instant de référence de la
 * liste ; sa fin est alors rendue, sinon `null` (pas de boost, boost échu, ou clé absente).
 */
export function boostEnCours(property: Pick<PropertyListItem, 'sponsored_until'>, maintenant: Date): Date | null {
  if (!property.sponsored_until) return null;
  const fin = new Date(property.sponsored_until);
  return fin.getTime() > maintenant.getTime() ? fin : null;
}

/**
 * L'ancienneté de l'annonce. Deux temps, sans écart d'hydratation : le serveur et le premier rendu
 * client peignent la date absolue, le relatif se calcule après (`useSyncExternalStore`, TCK-316 —
 * déplacé de `PropertyList.tsx` avec la ligne d'avant). `wo` retombe sur `fr` : Chrome ne sert pas
 * `Intl.RelativeTimeFormat` en wolof.
 */
function DateRelative({ value }: { readonly value: string | undefined }) {
  const fmt = useFormatteurs();
  const date = useMemo(() => (value ? new Date(value) : null), [value]);
  const lireRelatif = useMemo(() => {
    let memo: string | null = null;
    return (): string | null => (date ? (memo ??= relatif(date, fmt.locale)) : null);
  }, [date, fmt.locale]);
  const relatifCourant = useSyncExternalStore(sAbonnerARien, lireRelatif, () => null);
  if (!date || Number.isNaN(date.getTime())) return null;
  const absolu = fmt.date(date, { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <time dateTime={date.toISOString()} title={absolu}>
      {relatifCourant ?? absolu}
    </time>
  );
}

function sAbonnerARien(): () => void {
  return () => {};
}

function relatif(date: Date, locale: Locale): string {
  const ecart = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(ecart);
  const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en' : 'fr', { numeric: 'auto' });
  if (abs < 60) return rtf.format(ecart, 'second');
  if (abs < 3600) return rtf.format(Math.round(ecart / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(ecart / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(ecart / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(ecart / (86400 * 30)), 'month');
  return rtf.format(Math.round(ecart / (86400 * 365)), 'year');
}

/**
 * TCK-2678 (ADR-0097 § 5) — sous la pastille « Hors ligne », le PREMIER motif, sur une ligne coupée
 * proprement ; tous les motifs au survol et au focus clavier (une infobulle ne s'ouvre pas au toucher :
 * au téléphone, le premier motif seul). Les motifs suivants sont lus aux lecteurs d'écran.
 */
function MotifDeLaCarte({ motifs }: { readonly motifs: readonly string[] }) {
  const t = useTranslations('property.dashboard.horsLigne');
  const phrases = phrasesDesMotifs(motifs, (cle) => t(cle));
  if (phrases.length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // Un bouton sans action : le déclencheur d'une infobulle doit prendre le focus clavier, et un `<p>`
          // focalisable n'est pas un élément interactif (jsx-a11y). Au-dessus du lien étiré de la carte.
          <button
            type="button"
            data-testid="motif-hors-ligne"
            className="relative z-10 mt-1.5 block w-full truncate rounded-sm text-left text-xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
          />
        }
      >
        {phrases[0]}
        {phrases.length > 1 ? <span className="sr-only"> {phrases.slice(1).join(' ')}</span> : null}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span role="list" className="block space-y-0.5">
          {phrases.map((phrase) => (
            <span role="listitem" key={phrase} className="block">
              {phrase}
            </span>
          ))}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
