'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight, Clock } from 'lucide-react';

import { StatusBadge } from '@/components/console/StatusBadge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { attenteDe, gestesDeLaCarte, type Attente, type Duree, type GesteDeCarte, type InterventionEnFile } from '@/lib/maintenance/files';
import { cn } from '@/lib/utils';

import { RelancerLeBailleur } from './RelancerLeBailleur';

/**
 * TCK-2653 — les pièces des files d'interventions de l'agence (maquette `app-interventions`,
 * approche a, « Agence — files ») : l'attente écrite sur chaque carte, la carte pleine du téléphone,
 * la carte de colonne du bureau et la ligne compacte des files sans geste (en cours, à confirmer).
 *
 * Toute la carte mène à la fiche (lien étiré du titre) ; ses gestes y mènent aussi, avec `?geste=`,
 * qui ouvre la fiche sur le geste choisi.
 */

export function lienDeLaFiche(id: number, geste?: GesteDeCarte): string {
  return geste ? `/app/maintenance/${id}?geste=${geste}` : `/app/maintenance/${id}`;
}

/** Le texte de l'attente, formaté (durées et dates au fuseau de Dakar, par `useFormatteurs`). */
export function useTexteDAttente(): (a: Attente) => string {
  const t = useTranslations('maintenance.files.attente');
  const f = useFormatteurs();
  const duree = (d: Duree) => f.nombre(d.n, { style: 'unit', unit: d.unite, unitDisplay: 'short' });
  return (a) => {
    switch (a.cle) {
      case 'ouverte':
      case 'chezLeBailleur':
      case 'devisADecider':
      case 'devisDemande':
      case 'confiee':
        return t(a.cle, { duree: duree(a.duree) });
      case 'creneauDepasse':
        return t('creneauDepasse', { date: f.jourMois(a.creneau), duree: duree({ n: a.jours, unite: 'day' }) });
      case 'creneau':
        return t('creneau', { date: f.jourMois(a.creneau), heure: f.heure(a.creneau) });
      case 'aConfirmer':
        if (a.terminee === null) return t('terminee');
        if (a.jours === null) return t('termineeLe', { date: f.jourMois(a.terminee) });
        if (a.jours === 0) return t('clotureAujourdhui', { date: f.jourMois(a.terminee) });
        return t('aConfirmer', { date: f.jourMois(a.terminee), duree: duree({ n: a.jours, unite: 'day' }) });
    }
  };
}

/** L'attente : une horloge, le texte, en rouge (créneau dépassé) ou en ambre (attente anormale). */
export function LigneDAttente({ attente, className }: { readonly attente: Attente; readonly className?: string }) {
  const texte = useTexteDAttente();
  return (
    <span
      data-slot="attente"
      data-ton={attente.ton}
      className={cn(
        'inline-flex items-center gap-1 text-ui',
        attente.ton === 'rouge' ? 'font-semibold text-destructive' : attente.ton === 'ambre' ? 'font-semibold text-warning' : 'text-muted-foreground',
        className,
      )}
    >
      <Clock className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
      {texte(attente)}
    </span>
  );
}

/** La priorité en pastille, seulement quand elle compte : urgente (danger) ou élevée (attention). */
export function PastilleDePriorite({ priorite }: { readonly priorite: InterventionEnFile['priority'] }) {
  const t = useTranslations('maintenance.priority');
  if (priorite !== 'urgent' && priorite !== 'high') return null;
  return <StatusBadge label={t(priorite)} tone={priorite === 'urgent' ? 'danger' : 'attention'} />;
}

/** Le bien et son quartier ; le quartier se tait quand le titre le nomme déjà (« Bureaux à Hann Maristes 1 »). */
export function lieu(i: Pick<InterventionEnFile, 'property'>): string[] {
  const titre = i.property?.title ?? null;
  const quartier = i.property?.location?.quarter ?? null;
  const redit = titre !== null && quartier !== null && titre.toLocaleLowerCase('fr').includes(quartier.toLocaleLowerCase('fr'));
  return [titre, redit ? null : quartier].filter((x): x is string => Boolean(x));
}

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function useLibelleDeGeste() {
  const t = useTranslations('maintenance.files.gestes');
  return (g: GesteDeCarte) => t(g);
}

/**
 * Les gestes d'une carte, chacun vers la fiche ouverte sur lui. Le premier est primaire à dispatcher.
 * TCK-2786 — « Relancer le bailleur » agit depuis la carte, sans passer par la fiche ; au bureau, la
 * carte de colonne ne porte que lui (maquette), « Voir le devis » étant toute la carte.
 */
function Gestes({ i, taille, maintenant }: { readonly i: InterventionEnFile; readonly taille: 'telephone' | 'colonne'; readonly maintenant: Date }) {
  const libelle = useLibelleDeGeste();
  const gestes = gestesDeLaCarte(i).filter((g) => taille === 'telephone' || i.file !== 'chez_le_bailleur' || g === 'relancerBailleur');
  if (gestes.length === 0) return null;
  return (
    <div data-slot="gestes" className={cn('relative z-10 flex flex-wrap', taille === 'telephone' ? 'mt-3 gap-2' : 'mt-2 gap-1.5')}>
      {gestes.map((g) => g === 'relancerBailleur' ? (
        <RelancerLeBailleur key={g} request={i} maintenant={maintenant} taille={taille} />
      ) : (
        <Link
          key={g}
          href={lienDeLaFiche(i.id, g)}
          className={cn(
            'inline-flex min-w-0 flex-1 items-center justify-center whitespace-nowrap font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring',
            taille === 'telephone' ? 'h-11 rounded-lg px-3 text-sm' : 'h-8 rounded-md px-2 text-xs',
            g === 'choisir' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border bg-card text-foreground hover:bg-muted',
          )}
        >
          {libelle(g)}
        </Link>
      ))}
    </div>
  );
}

/** « Devis de {prestataire} : {montant} », ou « Confiée à {prestataire} » en retard. */
function LigneDuPrestataire({ i }: { readonly i: InterventionEnFile }) {
  const t = useTranslations('maintenance.files.carte');
  const f = useFormatteurs();
  const nom = i.assignee?.name ?? null;
  if (i.quote_amount !== null && i.quote_amount !== undefined && (i.file === 'chez_le_bailleur' || i.status === 'quote_submitted')) {
    const montant = f.montantCourt(i.quote_amount, i.quote_currency);
    return <p className="mt-1 text-ui">{nom ? t.rich('devisDe', { nom, montant, b: (c) => <span className="font-semibold tabular-nums">{c}</span> }) : t.rich('devis', { montant, b: (c) => <span className="font-semibold tabular-nums">{c}</span> })}</p>;
  }
  if (i.file === 'en_retard' && nom) return <p className="mt-1 text-ui">{t('confieeA', { nom })}</p>;
  return null;
}

/** La carte pleine du téléphone : files à geste (à dispatcher, en retard, chez le bailleur). */
export function CarteDeFile({ i, maintenant }: { readonly i: InterventionEnFile; readonly maintenant: Date }) {
  const tCategorie = useTranslations('maintenance.category');
  const attente = attenteDe(i, maintenant);
  return (
    <article data-slot="carte-de-file" data-id={i.id} className="relative rounded-xl border border-border bg-card p-4 focus-within:ring-3 focus-within:ring-ring">
      <div className="flex items-center gap-2">
        <PastilleDePriorite priorite={i.priority} />
        <span className="text-xs text-muted-foreground">{tCategorie(i.category)}</span>
      </div>
      <h3 className="mt-1.5 text-base leading-snug font-semibold">
        <Link href={lienDeLaFiche(i.id)} className="outline-none after:absolute after:inset-0 after:rounded-xl">
          {i.title}
        </Link>
      </h3>
      <p className="mt-0.5 text-ui text-muted-foreground">{[...lieu(i), i.requester?.name].filter(Boolean).join(' · ')}</p>
      <LigneDuPrestataire i={i} />
      {attente ? (
        <p className="mt-2">
          <LigneDAttente attente={attente} />
        </p>
      ) : null}
      <Gestes i={i} taille="telephone" maintenant={maintenant} />
    </article>
  );
}

/** La ligne compacte du téléphone : files sans geste (en cours, à confirmer). */
export function LigneDeFile({ i, maintenant }: { readonly i: InterventionEnFile; readonly maintenant: Date }) {
  const attente = attenteDe(i, maintenant);
  const texte = useTexteDAttente();
  return (
    <li data-slot="ligne-de-file" data-id={i.id}>
      <Link href={lienDeLaFiche(i.id)} className="flex min-h-16 items-center gap-3 px-4 py-2.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/50">
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-base font-medium">{i.title}</span>
          <span className="mt-0.5 block truncate text-ui text-muted-foreground">{[...lieu(i), i.assignee?.name].filter(Boolean).join(' · ')}</span>
          {attente ? <span className="mt-0.5 block text-xs text-muted-foreground">{texte(attente)}</span> : null}
        </span>
        <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** La carte d'une colonne du bureau. */
export function CarteDeColonne({ i, maintenant }: { readonly i: InterventionEnFile; readonly maintenant: Date }) {
  const f = useFormatteurs();
  const t = useTranslations('maintenance.files.carte');
  const attente = attenteDe(i, maintenant);
  const prestataire = i.assignee?.name ?? null;
  const devis = i.quote_amount !== null && i.quote_amount !== undefined && (i.file === 'chez_le_bailleur' || i.status === 'quote_submitted');
  return (
    <article data-slot="carte-de-colonne" data-id={i.id} className="relative rounded-lg border border-border bg-card p-3 focus-within:ring-3 focus-within:ring-ring">
      {i.priority === 'urgent' || i.priority === 'high' ? (
        <p className="mb-1.5">
          <PastilleDePriorite priorite={i.priority} />
        </p>
      ) : null}
      <h3 className="text-sm leading-snug font-semibold">
        <Link href={lienDeLaFiche(i.id)} className="outline-none after:absolute after:inset-0 after:rounded-lg">
          {i.title}
        </Link>
      </h3>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">
        {lieu(i).join(' · ')}
        {i.requester?.name ? (
          <>
            <br />
            {i.requester.name}
          </>
        ) : null}
      </p>
      {prestataire ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs">
          <Avatar size="sm" className="size-5">
            <AvatarFallback className="text-pastille">{initiales(prestataire)}</AvatarFallback>
          </Avatar>
          <span className="truncate">{prestataire}</span>
        </p>
      ) : null}
      {devis ? <p className="mt-1.5 text-xs font-semibold tabular-nums">{t('devisCourt', { montant: f.montantCourt(i.quote_amount, i.quote_currency) })}</p> : null}
      {attente ? (
        <p className="mt-2 border-t border-border pt-2">
          <LigneDAttente attente={attente} className="text-xs" />
        </p>
      ) : null}
      <Gestes i={i} taille="colonne" maintenant={maintenant} />
    </article>
  );
}
