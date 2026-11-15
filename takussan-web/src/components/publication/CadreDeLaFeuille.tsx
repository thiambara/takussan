'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';

/**
 * TCK-2601 (AC5) — le bureau : dès 1280 px (`xl`, la largeur de la maquette « bureau »), la feuille de
 * compte n'est plus une feuille. Son contenu prend la place de l'étape dans la colonne gauche de
 * l'assistant (`WizardShell`, `refDuPanneau`), « Revenir à l'annonce » au-dessus, et l'aperçu de
 * l'annonce RESTE à droite pendant tout le compte — c'est lui qui rappelle l'annonce, d'où l'absence
 * du rappel dans le panneau. Sous 1280 px, la `FeuilleDuBas` d'avant, inchangée.
 *
 * ⚠ Un seul point de montage : seule l'ENVELOPPE change (feuille ou portail dans la colonne), jamais
 * le composant qui la porte. L'état de la feuille (numéro saisi, code envoyé, prénom) survit donc à
 * un redimensionnement de part et d'autre de 1280 px. Rendre les deux et en cacher un par CSS
 * doublerait les `id` des champs et les crochets de l'entrée par téléphone.
 *
 * Ce que le dialogue modal donnait seul, le panneau le refait : le focus va au titre à l'ouverture et
 * revient, à la fermeture, à ce qui l'avait (« Publier ») ; « Revenir » attend la fin d'une écriture
 * (`occupe`), comme le voile et `Échap` de la feuille. La soumission implicite du formulaire de
 * l'assistant — Entrée dans le numéro, désormais DANS le `<form>` — est neutralisée par l'assistant.
 *
 * Au téléphone (AC5, 390 px), la feuille monte AU-DESSUS du clavier : le clavier ne réduit que la
 * fenêtre visuelle, et une feuille posée en `bottom: 0` gardait « Recevoir un code » et « Publier mon
 * annonce » dessous. Elle remonte de ce que le clavier cache (`useDecalageDuClavier`, celui de la
 * coque d'entrée) et sa hauteur se réduit d'autant ; son corps défile, son pied reste.
 */
export const REQUETE_DU_PANNEAU = '(width >= 80rem)';

/** Le panneau de bureau est-il le régime ? Il faut la largeur ET une place où se rendre. */
export function usePanneauDeBureau(cible: HTMLElement | null): boolean {
  const large = useMatchesMedia(REQUETE_DU_PANNEAU);
  return large && cible !== null;
}

interface CadreDeLaFeuilleProps {
  readonly ouverte: boolean;
  readonly onFermer: () => void;
  /** Une écriture est en cours : on ne referme pas sous elle. */
  readonly occupe: boolean;
  /** Le régime (`usePanneauDeBureau`), lu par le composant qui porte la feuille. */
  readonly bureau: boolean;
  /** Le nœud de la colonne gauche où le panneau se rend. */
  readonly cible: HTMLElement | null;
  /** Le titre de la feuille, sous 1280 px. */
  readonly titre: string;
  /** Le titre du panneau, qui remplace celui de l'étape. */
  readonly titreDuPanneau: string;
  /** L'annonce en une ligne : dans la feuille seulement (au bureau, l'aperçu est à droite). */
  readonly rappel: ReactNode;
  /** Le geste principal du moment (« Recevoir un code », « Publier mon annonce »…). */
  readonly action: ReactNode;
  /** La mention écrite SOUS le geste (« En publiant, vous acceptez… », maquette a-7). */
  readonly mention?: ReactNode;
  /** Les assurances écrites sous le panneau — seulement celles qui sont vraies (cf. le ticket). */
  readonly assurances?: readonly string[];
  readonly children: ReactNode;
}

export function CadreDeLaFeuille({
  ouverte, onFermer, occupe, bureau, cible, titre, titreDuPanneau, rappel, action, mention, assurances = [], children,
}: CadreDeLaFeuilleProps) {
  const t = useTranslations('property.wizard.feuille');
  const clavier = useDecalageDuClavier();
  // Au téléphone, la maquette (a-6, a-7) n'a que le ✕ de 44 px : pas de « Revenir à l'annonce » au pied.
  const pasTelephone = useMatchesMedia('(width >= 48rem)');

  if (bureau && cible) {
    return ouverte
      ? createPortal(
          <PanneauDeCompte
            titre={titreDuPanneau}
            surtitre={t('surtitre')}
            revenir={t('revenir')}
            occupe={occupe}
            onFermer={onFermer}
            action={action}
            mention={mention}
            assurances={assurances}
          >
            {children}
          </PanneauDeCompte>,
          cible,
        )
      : null;
  }

  return (
    <FeuilleDuBas
      open={ouverte}
      onOpenChange={(suivante) => {
        if (!suivante && !occupe) onFermer();
      }}
      titre={titre}
      // Maquette a-6 / a-7 : 80 % de la hauteur au téléphone, quel que soit le contenu (le pied reste
      // en bas, le corps défile). Dès `md`, le panneau latéral de la primitive.
      className="max-md:h-[80dvh]"
      style={clavier > 0 ? { bottom: clavier, maxHeight: `calc(90dvh - ${clavier}px)` } : undefined}
      pied={
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row-reverse md:flex-wrap">
          {action}
          {/* Sous le geste, centrée (maquette a-7) ; dans la rangée du panneau latéral (`md`), une ligne à part. */}
          {mention ? <div className="mt-0.5 text-center md:order-last md:w-full md:text-right">{mention}</div> : null}
          {pasTelephone ? (
            <Button type="button" variant="ghost" className="w-full md:w-auto" disabled={occupe} onClick={onFermer}>
              {t('revenir')}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {rappel}
        {children}
      </div>
    </FeuilleDuBas>
  );
}

interface PanneauDeCompteProps {
  readonly titre: string;
  readonly surtitre: string;
  readonly revenir: string;
  readonly occupe: boolean;
  readonly onFermer: () => void;
  readonly action: ReactNode;
  readonly mention?: ReactNode;
  readonly assurances: readonly string[];
  readonly children: ReactNode;
}

function PanneauDeCompte({ titre, surtitre, revenir, occupe, onFermer, action, mention, assurances, children }: PanneauDeCompteProps) {
  const idTitre = useId();
  const titreRef = useRef<HTMLHeadingElement>(null);
  // `undefined` = pas encore relevé. ⚠ Relevé UNE fois : sous le Strict Mode (actif en
  // développement), l'effet de montage repasse sur la même fibre, quand le focus est déjà au titre
  // du panneau — un relevé à chaque passage rendrait le focus, à la fermeture, à un titre disparu.
  const ouvreur = useRef<HTMLElement | null | undefined>(undefined);

  // Monté à l'ouverture, démonté à la fermeture : le focus entre au titre et revient à « Publier ».
  useEffect(() => {
    if (ouvreur.current === undefined) {
      ouvreur.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    titreRef.current?.focus();
    return () => {
      if (ouvreur.current?.isConnected) ouvreur.current.focus();
    };
  }, []);

  return (
    // La colonne (marges, largeur) est celle du nœud de `WizardShell` qui reçoit le panneau : la colonne
    // plein écran de `/app/properties/new`, ou la colonne de 560 px du cadre d'entrée (`/publish`, TCK-2600).
    <section aria-labelledby={idTitre} data-panneau-de-compte="">
      <button
        type="button"
        disabled={occupe}
        onClick={onFermer}
        // Dans le cadre d'entrée (maquette a-6 / a-7), le texte de « Revenir » est en haut de la colonne et
        // la carte 37 px plus bas : la cible de 44 px déborde de 11 px au-dessus et de 5 en dessous.
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 in-data-cadre-d-entree:-mt-3 in-data-cadre-d-entree:-mb-1.5"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {revenir}
      </button>
      <div className="mt-4 rounded-2xl border border-border bg-card p-8">
        <p className="text-xs font-semibold tracking-surtitre text-muted-foreground uppercase">{surtitre}</p>
        <h1
          id={idTitre}
          ref={titreRef}
          tabIndex={-1}
          className="mt-2 font-display text-affiche-32 leading-[1.1] font-semibold tracking-tight text-balance text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {titre}
        </h1>
        <div className="mt-3 space-y-5">{children}</div>
        <div className="mt-6 flex items-center gap-4 [&_[data-slot=button]]:min-w-[13.75rem]" data-panneau-action="">
          {action}
        </div>
        {mention ? <div className="mt-3">{mention}</div> : null}
      </div>
      {assurances.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-ui text-muted-foreground">
          {assurances.map((assurance) => (
            <li key={assurance} className="flex items-center gap-1.5">
              <Check className="size-3.5 text-accent" strokeWidth={2.5} aria-hidden="true" />
              {assurance}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
