'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { Check, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Switch } from '@/components/ui/switch';
import type { EtatDeSection } from '@/lib/agence/fiche';
import { cn } from '@/lib/utils';

/**
 * TCK-2670 — les pièces communes de la fiche de l'agence, telles que la maquette retenue les dessine
 * (`app-identite-agence-sections.tsx`) : la jauge, le point d'état d'une section, le titre d'une
 * section au bureau, un groupe de champs, l'encart « ce qui manque » et l'interrupteur à aide.
 */

/** La barre de la jauge : la part remplie en couleur principale. */
export function BarreDeCompletude({ pourcent, className }: { readonly pourcent: number; readonly className?: string }) {
  return (
    <span className={cn('block h-2 overflow-hidden rounded-full bg-muted', className)} aria-hidden="true">
      <span className="block h-full rounded-full bg-primary" style={{ width: `${pourcent}%` }} />
    </span>
  );
}

/** Le point d'une section : coche (complète), pastille (incomplète), triangle (à traiter). */
export function PointDEtat({ etat, avecCoche = true }: { readonly etat: EtatDeSection; readonly avecCoche?: boolean }) {
  const t = useTranslations('admin.agencyConfig.fiche.etats');
  if (etat === 'ok') {
    return avecCoche ? (
      <Check className="size-4 flex-none text-success" strokeWidth={2.25} role="img" aria-label={t('ok')} />
    ) : null;
  }
  if (etat === 'alerte') {
    return <TriangleAlert className="size-icone flex-none text-destructive" strokeWidth={2} role="img" aria-label={t('alerte')} />;
  }
  return <span className="size-2.5 flex-none rounded-full bg-warning" role="img" aria-label={t('incomplet')} />;
}

/**
 * Le titre d'une section et son texte. Au téléphone, le titre est celui de l'en-tête de la coque :
 * le `<h2>` reste pour les lecteurs d'écran, le texte reste visible.
 */
export function TitreDeSection({
  id,
  titre,
  texte,
  texteAuBureauSeulement = false,
}: {
  readonly id: string;
  readonly titre: string;
  readonly texte?: string;
  /** La maquette du téléphone ouvre certaines sections sans leur texte (Identité, Facturation). */
  readonly texteAuBureauSeulement?: boolean;
}) {
  return (
    <div className={cn('mb-5', texteAuBureauSeulement && 'max-md:mb-0')}>
      <h2 id={id} className="font-display text-xl font-semibold tracking-titre max-md:sr-only">
        {titre}
      </h2>
      {texte ? (
        <p className={cn('text-pretty text-sm text-muted-foreground md:mt-1 md:max-w-[40rem]', texteAuBureauSeulement && 'max-md:hidden')}>{texte}</p>
      ) : null}
    </div>
  );
}

/** Un groupe de champs titré (« Identité », « Contact », « Mentions légales »…). */
export function GroupeDeChamps({
  titre,
  texte,
  children,
  className,
}: {
  readonly titre: string;
  readonly texte?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    // La bordure (« separe ») sur une enveloppe : sur le `fieldset`, la légende s'y poserait, coupant le trait.
    <div className={cn('min-w-0', className)}>
      <fieldset className="min-w-0">
        <legend className="text-corps font-semibold">{titre}</legend>
        {texte ? <p className="mt-0.5 text-pretty text-ui text-muted-foreground">{texte}</p> : null}
        <div className="mt-3 space-y-4">{children}</div>
      </fieldset>
    </div>
  );
}

/** Ce qui manque dans une section — le même point orange que le sommaire et la jauge. */
export function EncartManque({
  titre,
  children,
  action,
  className,
}: {
  readonly titre: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-warning/30 bg-warning/10 p-4', className)} data-slot="encart-manque">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-2.5 flex-none rounded-full bg-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-corps font-semibold">{titre}</p>
          <div className="mt-1 text-pretty text-sm text-encre-douce">{children}</div>
        </div>
        {action}
      </div>
    </div>
  );
}

/**
 * Un interrupteur avec son libellé et son aide : toute la ligne est la cible (le `<label>` enveloppe
 * l'interrupteur). `pied` : un compte et son lien (« 1 bien attend votre validation · Ouvrir la file »).
 */
export function InterrupteurAAide({
  id,
  libelle,
  aide,
  actif,
  onChange,
  pied,
}: {
  readonly id: string;
  readonly libelle: string;
  readonly aide: string;
  readonly actif: boolean;
  readonly onChange: (actif: boolean) => void;
  readonly pied?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <label className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
        <span className="col-start-1 text-corps font-medium leading-snug">{libelle}</span>
        <span id={`${id}-aide`} className="col-start-1 row-start-2 mt-1 text-pretty text-ui leading-snug text-muted-foreground">
          {aide}
        </span>
        <Switch
          id={id}
          className="col-start-2 row-span-2 row-start-1 mt-0.5"
          checked={actif}
          onCheckedChange={(valeur) => onChange(valeur)}
          aria-describedby={`${id}-aide`}
        />
      </label>
      {pied ? <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-3 text-ui">{pied}</div> : null}
    </div>
  );
}

/** L'étiquette « modifié » ou « à remplir » d'un libellé de champ. */
export function EtiquetteDuChamp({ libelle, modifie, manque }: { readonly libelle: string; readonly modifie?: boolean; readonly manque?: boolean }) {
  const t = useTranslations('admin.agencyConfig.fiche.champ');
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {libelle}
      {modifie ? (
        <span className="rounded-full bg-secondary px-1.5 py-px text-legende font-medium text-primary-deep">{t('modifie')}</span>
      ) : manque ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-1.5 py-px text-legende font-medium">
          <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
          {t('aRemplir')}
        </span>
      ) : null}
    </span>
  );
}

/** Le liseré d'un champ : terracotta modifié, tirets orange à remplir. */
export function classesDuChamp(modifie: boolean, manque: boolean): string | undefined {
  if (modifie) return 'border-primary ring-2 ring-primary/15';
  if (manque) return 'border-dashed border-warning';
  return undefined;
}

/** Un cadre d'aperçu (« Ce que voit votre locataire », « Ce qui s'imprime sur vos factures »…). */
export function CadreDApercu({ titre, children, className }: { readonly titre: string; readonly children: ReactNode; readonly className?: string }) {
  return (
    <aside className={cn('rounded-xl border border-border bg-background p-3.5', className)} aria-label={titre}>
      <p className="text-xs font-medium text-muted-foreground">{titre}</p>
      <div className="mt-2.5">{children}</div>
    </aside>
  );
}

/** Le logo de l'agence, ou ses initiales. */
export function LogoDeLAgence({ url, nom, taille = 56 }: { readonly url: string | null; readonly nom: string; readonly taille?: number }) {
  const initiales = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('');
  const style = { width: `${taille / 16}rem`, height: `${taille / 16}rem`, fontSize: `${(taille * 0.36) / 16}rem` };
  if (url) {
    return (
      <Image src={url} alt="" width={taille} height={taille} unoptimized className="flex-none rounded-xl bg-secondary object-contain" style={style} />
    );
  }
  return (
    <span
      className="inline-flex flex-none items-center justify-center rounded-xl bg-secondary font-display font-semibold text-primary-deep"
      style={style}
      aria-hidden="true"
    >
      {initiales}
    </span>
  );
}
