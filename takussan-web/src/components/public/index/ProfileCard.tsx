import { BadgeCheck, MapPin, Star } from 'lucide-react';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ProfilPublic } from '@/lib/queries/public-profiles';

export type LibellesDeCarte = {
  readonly portefeuille: (n: number) => string;
  readonly aLouer: (n: number) => string;
  readonly aVendre: (n: number) => string;
  readonly avis: (n: number) => string;
  readonly verifie: string;
  readonly noteAria: (note: number) => string;
};

type Props = {
  readonly profil: ProfilPublic;
  /** `/agencies` ou `/agents` — la carte ne connaît que le préfixe, pas la ressource. */
  readonly base: string;
  readonly libelles: LibellesDeCarte;
  /** Forme circulaire pour une personne, arrondie pour une enseigne. */
  readonly forme: 'rond' | 'carre';
};

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/**
 * Une carte d'index de profil — TCK-436.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ELLE HÉRITE DU VOCABULAIRE DES FICHES, ELLE N'EN INVENTE PAS UN SECOND
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `rounded-2xl border border-border bg-card`, l'eyebrow en capitales espacées
 * (`uppercase tracking-[0.18em]`), `font-display` sur le nom, `tabular-nums` sur les chiffres :
 * ce sont exactement les classes de `StatsBar` et des fiches livrées par TCK-242/276. Passer de
 * l'index à la fiche ne change donc pas de monde, ce que demande le § Direction UX du ticket.
 *
 * ⚠ **Aucun champ de contact n'est rendu, et il n'y en a pas non plus à rendre** : l'API ne les
 * sert pas sur ces deux endpoints (cf. `PublicAgentController::index()`). La carte mène à la
 * fiche, où le contact vit. *Une carte d'annuaire qui porte un numéro de téléphone est une ligne
 * de fichier de démarchage.*
 *
 * L'ordre d'information suit les priorités du ticket : la ville et le volume de portefeuille
 * d'abord, la note ensuite quand elle existe, l'enseigne pour un agent.
 */
export function ProfileCard({ profil, base, libelles, forme }: Props) {
  const note = profil.reviews.average;

  return (
    <li className="group">
      <LienLocalise
        href={`${base}/${encodeURIComponent(profil.slug)}`}
        className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="flex items-start gap-4">
          <Avatar
            className={forme === 'rond' ? 'size-14 shrink-0' : 'size-14 shrink-0 rounded-xl'}
          >
            {profil.logo_url ? (
              <AvatarImage src={profil.logo_url} alt="" />
            ) : null}
            <AvatarFallback
              className={forme === 'rond' ? 'font-display' : 'rounded-xl font-display'}
            >
              {initiales(profil.nom)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            {/* L'eyebrow porte la VILLE — la première des priorités du ticket. */}
            {profil.city && (
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <MapPin className="size-3" aria-hidden />
                <span className="truncate">{profil.cities.join(' · ')}</span>
              </p>
            )}
            <h3 className="mt-1 flex items-center gap-1.5 font-display text-lg font-semibold leading-tight text-foreground">
              <span className="truncate">{profil.nom}</span>
              {profil.is_verified && (
                <BadgeCheck className="size-4 shrink-0 text-primary" aria-label={libelles.verifie} />
              )}
            </h3>
            {profil.agency && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{profil.agency.name}</p>
            )}
            {!profil.agency && profil.specialty && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{profil.specialty}</p>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="font-display text-2xl font-semibold tabular-nums text-primary">
            {profil.portfolio_count}
            <span className="ml-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {libelles.portefeuille(profil.portfolio_count)}
            </span>
          </p>
          {note !== null && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="size-3.5 fill-current text-primary" aria-hidden />
              <span className="tabular-nums text-foreground" aria-label={libelles.noteAria(note)}>
                {note.toFixed(1)}
              </span>
              <span>{libelles.avis(profil.reviews.count)}</span>
            </p>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {[
            profil.rent_count > 0 ? libelles.aLouer(profil.rent_count) : null,
            profil.sale_count > 0 ? libelles.aVendre(profil.sale_count) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </LienLocalise>
    </li>
  );
}
