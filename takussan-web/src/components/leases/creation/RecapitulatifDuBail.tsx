import type { MouseEvent, ReactNode } from 'react';
import Image from 'next/image';
import { Settings2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface LigneDeRecapitulatif {
  readonly cle: string;
  readonly valeur: ReactNode;
}

/**
 * TCK-2643 — une carte du récapitulatif de l'étape « Vérifier » (maquette `app-baux` a,
 * `MobileAVerifier`) : un titre, « Modifier » qui ramène à l'étape, puis des lignes clé / valeur.
 */
export function CarteDeRecapitulatif({
  titre,
  modifier,
  onModifier,
  lignes,
}: {
  readonly titre: string;
  readonly modifier: string;
  readonly onModifier: () => void;
  readonly lignes: readonly LigneDeRecapitulatif[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-1.5">
      <div className="flex items-center py-2">
        <h3 className="flex-1 text-ui font-semibold text-muted-foreground">{titre}</h3>
        <button
          type="button"
          onClick={onModifier}
          aria-label={`${modifier} — ${titre}`}
          className="relative rounded-md text-sm font-medium text-primary outline-none after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] focus-visible:ring-3 focus-visible:ring-ring"
        >
          {modifier}
        </button>
      </div>
      <dl>
        {lignes.map((ligne) => (
          <div key={ligne.cle} className="flex items-baseline justify-between gap-4 py-2 text-sm">
            <dt className="text-muted-foreground">{ligne.cle}</dt>
            <dd className="min-w-0 text-right font-medium tabular-nums text-foreground">{ligne.valeur}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * TCK-2643 — « Réglages de l'agence appliqués » (maquette `ReglagesAgence`). Le titre dit d'où
 * viennent les valeurs — l'agence quand l'une d'elles en vient, la plateforme sinon.
 *
 * TCK-2832 — « Modifier » (maquette) mène à `/app/agency/lease-settings`, à qui l'API dit pouvoir
 * écrire ces réglages (`can_edit_agency_settings`), jamais déduit du rôle.
 *
 * TCK-2921 — dans le MÊME onglet (plus de `target="_blank"`) : le formulaire garde d'abord sa saisie
 * en brouillon (TCK-2912), puis part (`onClick`) ; l'adresse porte `?depuis=bail` et les identifiants
 * du bail, et « Reprendre le bail » y ramène. Les défauts s'y relisent (`useLeaseDefaults`,
 * `staleTime: 0`) : le nouveau réglage préremplit les champs que l'agent n'a pas touchés.
 */
export function ReglagesAppliques({
  titre,
  detail,
  modifier,
  className,
}: {
  readonly titre: string;
  readonly detail: string;
  /**
   * Le libellé du lien, son complément lu seul (« les réglages de l'agence »), son adresse et le geste
   * qui garde la saisie avant de partir ; `erreur` : la saisie n'a pas pu être gardée. Absent : pas de lien.
   */
  readonly modifier?: {
    readonly libelle: string;
    readonly cible: string;
    readonly href: string;
    readonly onClick: (evenement: MouseEvent<HTMLAnchorElement>) => void;
    readonly erreur?: string | null;
  };
  readonly className?: string;
}) {
  return (
    <div className={className}>
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
      <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Settings2 className="size-icone" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-ui leading-snug text-muted-foreground">
        <span className="block text-sm font-medium text-foreground">{titre}</span>
        {detail}
      </p>
      {modifier ? (
        <a
          href={modifier.href}
          onClick={modifier.onClick}
          className="flex-none rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {modifier.libelle}
          <span className="sr-only"> {modifier.cible}</span>
        </a>
      ) : null}
    </div>
      {modifier?.erreur ? (
        <p role="alert" className="mt-1.5 text-ui font-medium text-destructive">
          {modifier.erreur}
        </p>
      ) : null}
    </div>
  );
}

/**
 * TCK-2643 — la photo du bien, 44 px (maquette `ContexteBail`) ; sans photo, le même carré au fond neutre,
 * vide : la place reste, rien n'invente une image.
 */
export function VignetteDuBien({ src, className }: { readonly src: string | null | undefined; readonly className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative size-11 flex-none overflow-hidden rounded-lg bg-muted', className)}>
      {src ? <Image src={src} alt="" fill sizes="48px" className="object-cover" /> : null}
    </span>
  );
}
