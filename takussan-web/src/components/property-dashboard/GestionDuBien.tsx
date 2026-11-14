'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check } from 'lucide-react';

import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { usePublicationAvecCoordonnees } from '@/components/contact/PublicationAvecCoordonnees';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  etatDuMois,
  ligneOccupant,
  loyerDuBien,
  publicationProposee,
  type EtatDuMois,
} from '@/lib/biens/etat-locatif';
import { useGesteEnVol } from '@/lib/biens/gestes-en-vol';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PropertyListItem } from '@/types/property';

import { PropertyRowActions } from './PropertyRowActions';
import { useGestesDuBien } from './useGestesDuBien';

/**
 * TCK-2638 — la ligne du mode Gestion : qui occupe le bien, le loyer AVEC sa période, l'état du mois.
 * La carte compacte du téléphone et les cellules du tableau de bureau lisent les mêmes fonctions de
 * `@/lib/biens/etat-locatif`, si bien qu'une carte et une ligne ne peuvent pas dire deux choses.
 * Les gestes ne changent pas : le « ⋯ » est `PropertyRowActions` (« Modifier » en tête), la case
 * est celle de la sélection de `PropertyList`.
 */

const TON: Record<EtatDuMois['ton'], StatusTone> = {
  succes: 'success',
  danger: 'danger',
  avertissement: 'attention',
  neutre: 'neutral',
  info: 'info',
};

/** L'état du mois en une puce ; `court` pour la colonne du tableau (« Retard 6 j »). */
export function PuceEtatDuMois({
  property,
  aujourdhui,
  court = false,
  alerte = false,
}: {
  readonly property: PropertyListItem;
  readonly aujourdhui: Date;
  readonly court?: boolean;
  /** TCK-2639 — la fiche (« Ce mois ») marque le retard d'un triangle ; la liste, non (maquette a-0). */
  readonly alerte?: boolean;
}) {
  const tGestion = useTranslations('property.dashboard.gestion');
  const fmt = useFormatteurs();
  const etat = etatDuMois(property, aujourdhui);
  if (!etat) return null;
  const forme = court ? 'etatCourt' : 'etat';
  const t = (cle: string, valeurs?: Record<string, string | number>) => tGestion(`${forme}.${cle}`, valeurs);
  let libelle: string;
  switch (etat.cle) {
    case 'enRetard':
    case 'vacantDepuis':
      libelle = t(etat.cle, { jours: etat.jours });
      break;
    case 'aEcheance':
    case 'preavis':
      libelle = etat.date
        ? t(etat.cle, { date: fmt.jourMois(etat.date, aujourdhui) })
        : t(`${etat.cle}SansDate`);
      break;
    default:
      libelle = t(etat.cle);
  }
  return (
    <StatusBadge
      tone={TON[etat.ton]}
      icon={
        etat.cle === 'paye' ? (
          <Check className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
        ) : alerte && etat.cle === 'enRetard' ? (
          <AlertTriangle className="size-3.5" strokeWidth={2} aria-hidden="true" />
        ) : undefined
      }
      label={libelle}
      className="whitespace-nowrap"
      data-testid="etat-du-mois"
    />
  );
}

/**
 * Le loyer et sa période (AC7). `periode="si-autre"` : la colonne « Loyer / mois » du tableau porte
 * déjà le mois, la cellule ne dit que les autres périodes ; un prix de vente se dit tel.
 */
export function MontantDuBien({
  property,
  periode = 'toujours',
  className,
  classePeriode,
}: {
  readonly property: PropertyListItem;
  readonly periode?: 'toujours' | 'si-autre';
  readonly className?: string;
  /** TCK-2638 (lot B) — la carte Annonces écrit le prix en grand et sa période en petit (maquette a-1). */
  readonly classePeriode?: string;
}) {
  const t = useTranslations('property.dashboard.gestion.loyer');
  const tPeriodes = useTranslations('property.rentPeriodsShort');
  const fmt = useFormatteurs();
  const loyer = loyerDuBien(property);
  if (!loyer) return <span className={cn('text-muted-foreground', className)}>—</span>;
  const montant = fmt.montantCourt(loyer.montant, loyer.devise);
  const montrerPeriode = loyer.periode !== null && (periode === 'toujours' || loyer.periode !== 'monthly');
  return (
    <span className={cn('whitespace-nowrap font-semibold tabular-nums', className)}>
      {montant}
      {montrerPeriode ? (
        <span className={cn('font-normal text-muted-foreground', classePeriode)}> / {tPeriodes(loyer.periode as string)}</span>
      ) : null}
      {/* Sous « Loyer / mois », un prix de vente se dit tel ; la carte le dit déjà (« À vendre »). */}
      {loyer.periode === null && periode === 'si-autre' ? (
        <span className="block text-xs font-normal text-muted-foreground">{t('prixDeVente')}</span>
      ) : null}
    </span>
  );
}

/** « Bail jusqu'au … », « Sans locataire », « À vendre » — la deuxième ligne de la carte. */
function texteOccupant(
  property: PropertyListItem,
  aujourdhui: Date,
  t: (cle: string, valeurs?: Record<string, string>) => string,
  jourMois: (valeur: string, maintenant: Date) => string,
): string | null {
  const ligne = ligneOccupant(property, aujourdhui);
  if (!ligne) return null;
  switch (ligne.cle) {
    case 'locataire':
      return ligne.fin
        ? t('locataire', { nom: ligne.nom, date: jourMois(ligne.fin, aujourdhui) })
        : t('locataireSansFin', { nom: ligne.nom });
    case 'sansLocataire':
      return property.owner?.name ? t('sansLocataireDe', { bailleur: property.owner.name }) : t('sansLocataire');
    default:
      return t(ligne.cle);
  }
}

/** La colonne « Locataire et fin de bail » du tableau : le nom, puis « jusqu'au … » en dessous. */
export function CelluleOccupant({
  property,
  aujourdhui,
}: {
  readonly property: PropertyListItem;
  readonly aujourdhui: Date;
}) {
  const t = useTranslations('property.dashboard.gestion.ligne');
  const fmt = useFormatteurs();
  const ligne = ligneOccupant(property, aujourdhui);
  if (!ligne) return <span className="text-muted-foreground">—</span>;
  if (ligne.cle !== 'locataire') return <span className="text-muted-foreground">{t(ligne.cle)}</span>;
  return (
    <span className="block leading-tight">
      <span className="block truncate">{ligne.nom}</span>
      {ligne.fin ? (
        <span className="block truncate text-xs tabular-nums text-muted-foreground">
          {t('jusquAu', { date: fmt.jourMois(ligne.fin, aujourdhui) })}
        </span>
      ) : null}
    </span>
  );
}

/** L'agent responsable en pastille d'initiales ; son nom en infobulle et pour l'assistance. */
export function CelluleAgent({ property }: { readonly property: PropertyListItem }) {
  const t = useTranslations('property.dashboard.gestion');
  const source = property.primary_contact_source;
  const agent =
    source === 'designated' || source === 'invitation_order' ? (property.primary_contact ?? null) : null;
  if (!agent) {
    return (
      <span className="text-muted-foreground" title={t('agentAucun')}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('agentAucun')}</span>
      </span>
    );
  }
  return (
    <Avatar size="28" title={agent.name}>
      {agent.avatar_url ? <AvatarImage src={agent.avatar_url} alt="" /> : null}
      <AvatarFallback className="text-xs">
        <span aria-hidden="true">{initialesDuNom(agent.name)}</span>
        <span className="sr-only">{agent.name}</span>
      </AvatarFallback>
    </Avatar>
  );
}

function initialesDuNom(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => Array.from(mot)[0] ?? '')
    .join('')
    .toUpperCase();
}

/** « Publier l'annonce » : le même `POST …/publish` que le menu, coordonnées demandées s'il en manque. */
export function PublierLAnnonce({ property, className }: { readonly property: PropertyListItem; readonly className?: string }) {
  const t = useTranslations('property.dashboard.gestion');
  const tActions = useTranslations('property.dashboard.actions');
  const router = useRouter();
  const { canPublish } = useGestesDuBien();
  const [retour, setRetour] = useState<{ readonly ok: boolean; readonly texte: string } | null>(null);
  const publication = usePublicationAvecCoordonnees(property.id, {
    onPublie: (statut) => {
      setRetour({ ok: true, texte: statut === 'pending_review' ? tActions('sentForReview') : tActions('published') });
      router.refresh();
    },
    onEchec: (message) => setRetour({ ok: false, texte: message || tActions('error') }),
  });
  // Contre-vérification de TCK-2638 (verif-commercial) — un statut, une duplication ou une suppression
  // en vol depuis le « ⋯ » du même bien (registre `gestes-en-vol`) ferme aussi « Publier l'annonce » :
  // sinon deux actions serveur partent sur le même bien. Le sens inverse l'est déjà : la publication
  // se marque dans le registre (`usePublicationAvecCoordonnees` → `pendantLeGeste`).
  const gesteEnVol = useGesteEnVol(property.id);
  if (!canPublish || !publicationProposee(property)) return null;
  return (
    <span className={cn('relative z-10 mt-1.5 flex flex-wrap items-center gap-x-2', className)}>
      <button
        type="button"
        onClick={() => {
          setRetour(null);
          publication.publier();
        }}
        disabled={publication.enCours || gesteEnVol}
        aria-label={t('publierPour', { title: property.title })}
        className="relative rounded-sm text-sm font-medium text-primary outline-none before:absolute before:inset-x-0 before:top-1/2 before:h-controle before:-translate-y-1/2 hover:underline focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
      >
        {t('publier')}
      </button>
      {retour ? (
        <span role={retour.ok ? 'status' : 'alert'} className={cn('text-xs', retour.ok ? 'text-success' : 'text-destructive')}>
          {retour.texte}
        </span>
      ) : null}
      {publication.dialogue}
    </span>
  );
}

/** La vignette : 72 px sur la carte, 40 dans le tableau. */
export function VignetteDuBien({ property, taille }: { readonly property: PropertyListItem; readonly taille: 'carte' | 'ligne' }) {
  const classes = cn(
    'relative block shrink-0 overflow-hidden bg-muted',
    taille === 'carte' ? 'size-18 rounded-xl' : 'size-10 rounded-lg',
  );
  if (!property.main_photo_url) return <span aria-hidden="true" className={classes} />;
  return (
    <span className={classes}>
      <Image src={property.main_photo_url} alt="" fill sizes={taille === 'carte' ? '72px' : '40px'} className="object-cover" />
    </span>
  );
}

/** Le quartier, sinon la ville : la maquette dit « Mermoz », pas « Dakar ». */
export function lieuDuBien(property: PropertyListItem): string | null {
  return property.location?.quarter || property.location?.city || null;
}

/**
 * La carte compacte du téléphone (sous `lg`) : vignette de 72 px, trois lignes — titre · quartier,
 * l'occupant, le loyer avec sa période et l'état du mois. La carte ENTIÈRE ouvre le bien (lien
 * étiré) ; à droite, le « ⋯ » et la case de sélection, chacun avec sa cible de 44 px, hors de la
 * photo.
 */
export function CarteGestion({
  property,
  aujourdhui,
  selectionne,
  onBasculer,
  libelleCase,
}: {
  readonly property: PropertyListItem;
  readonly aujourdhui: Date;
  readonly selectionne: boolean;
  readonly onBasculer: () => void;
  readonly libelleCase: string;
}) {
  const t = useTranslations('property.dashboard.gestion.ligne');
  const fmt = useFormatteurs();
  const lieu = lieuDuBien(property);
  const occupant = texteOccupant(property, aujourdhui, t, fmt.jourMois);
  return (
    <li
      data-testid="carte-gestion"
      className={cn('relative flex gap-3 px-4 py-3', selectionne && 'bg-primary/5')}
    >
      <VignetteDuBien property={property} taille="carte" />
      <div className="min-w-0 flex-1">
        <Link
          href={`/app/properties/${property.id}`}
          className="block truncate text-corps font-semibold text-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-3 focus-visible:after:ring-ring focus-visible:after:ring-inset"
        >
          {lieu ? `${property.title} · ${lieu}` : property.title}
        </Link>
        {occupant ? <p className="truncate text-ui text-muted-foreground">{occupant}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <MontantDuBien property={property} className="text-sm" />
          <PuceEtatDuMois property={property} aujourdhui={aujourdhui} />
        </div>
        <PublierLAnnonce property={property} />
      </div>
      <div className="relative z-10 -my-1 -mr-2 flex shrink-0 flex-col items-center justify-between">
        <PropertyRowActions property={property} layout="menu" />
        <label className="grid size-11 cursor-pointer place-items-center">
          <input
            type="checkbox"
            aria-label={libelleCase}
            checked={selectionne}
            onChange={onBasculer}
            className="size-5 cursor-pointer rounded-md accent-primary"
          />
        </label>
      </div>
    </li>
  );
}
