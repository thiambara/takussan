'use client';

import NextLink from 'next/link';
import { X } from 'lucide-react';
import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fieldDensityScope } from '@/components/ui/field-density';
import { cn } from '@/lib/utils';

import { useDecalageDuClavier } from './useDecalageDuClavier';

/**
 * TCK-2598 — LA coque des écrans d'entrée : connexion (`(auth)`), onboarding, invitation, `/publish`.
 * Maquettes `app-entree-*` (approche a) : une barre qui porte l'intention et l'avancement du parcours,
 * un contenu d'une colonne, un pied collé AU-DESSUS du clavier ; au bureau, une barre de 64 px et une
 * colonne de 480 px, et l'objet de l'intention (le bien, l'agence, l'aperçu) dans un panneau voisin —
 * sans objet, pas de panneau : ni villa ni slogan.
 *
 * ⚠ **Aucun espace de libellés ici.** La coque sert quatre frontières de dictionnaire (TCK-337) ; un
 * `useTranslations` la ferait transporter à chacune. Ses libellés arrivent en props, lus par le
 * serveur (`libellesDeLaCoque`, `getTranslations` : hors de la table des espaces servis).
 *
 * Deux sources pour ce que la barre montre : les props du layout (le défaut du segment) et ce que la
 * page DÉCLARE (`<DeclarerEntree …/>`, un état de page : l'étape d'un parcours, la saisie en cours, le
 * pied collant). La déclaration l'emporte, champ par champ.
 */

export interface LibellesDeLaCoque {
  /** `common.appName` : le nom accessible de la marque, lien vers l'accueil. */
  readonly marque: string;
  readonly retourAuSite: string;
  readonly fermer: string;
  readonly quitter: string;
  /** « Étape {pas} sur {total} » — gabarit brut, complété ici. */
  readonly avancement: string;
  readonly sortie: {
    readonly titre: string;
    readonly texte: string;
    readonly partir: string;
    readonly rester: string;
  };
}

export interface DeclarationDEntree {
  /** L'intention, titre de la barre (« Publier votre bien »). */
  readonly titre?: string;
  /** L'avancement du parcours ENTIER, compte compris. */
  readonly pas?: number;
  readonly total?: number;
  /** Une saisie existe : quitter demande confirmation. */
  readonly saisie?: boolean;
  /** Où la reprendre, dit par la confirmation (sinon le texte par défaut de la coque). */
  readonly reprise?: string;
  /**
   * Le bouton principal, collé en bas au téléphone (au-dessus du clavier), sous la colonne au bureau.
   * ⚠ Monté par la coque, HORS du `<form>` de la page : un bouton d'envoi y porte `form="<id du
   * formulaire>"`, et ne voit pas les contextes que la page monte sous la coque.
   */
  readonly pied?: ReactNode;
  /** L'objet de l'intention, en panneau voisin au bureau (dès `lg`). */
  readonly objet?: ReactNode;
}

/**
 * La sortie du segment : « Retour au site » (onboarding, invitation : un lien texte à droite), ou
 * « Quitter » (`/publish` : « ✕ » à gauche au téléphone, « Quitter » à droite au bureau).
 */
export interface SortieDeLEntree {
  readonly href: string;
  readonly forme: 'retour-au-site' | 'quitter';
}

export interface CoqueDEntreeProps extends Omit<DeclarationDEntree, 'saisie' | 'reprise'> {
  readonly libelles: LibellesDeLaCoque;
  /**
   * Le retour vers la page publique quittée (`RetourAuth`, TCK-568) : la flèche unique au téléphone,
   * la pastille « ← Retour au site » au bureau. Absent : la marque ouvre la barre.
   */
  readonly retour?: { readonly telephone: ReactNode; readonly bureau: ReactNode };
  readonly sortie?: SortieDeLEntree;
  /**
   * `etroite` : la colonne de 480 px des maquettes. `large` : la largeur des assistants d'onboarding
   * d'avant (rail d'étapes et formulaires à deux colonnes), tant que leurs tickets ne les refont pas.
   */
  readonly largeur?: 'etroite' | 'large';
  /** Les champs à 44 px (`fieldDensityScope`), comme le panneau de connexion d'avant. */
  readonly densiteDesChamps?: boolean;
  readonly children: ReactNode;
}

type Declarer = (id: string, declaration: DeclarationDEntree | null) => void;

/** Deux contextes : qui déclare ne se re-rend pas quand la déclaration change (pas de boucle). */
const ContexteDeclarer = createContext<Declarer | null>(null);

function fusionner(declarations: ReadonlyMap<string, DeclarationDEntree>): DeclarationDEntree {
  const sortie: Record<string, unknown> = {};
  for (const declaration of declarations.values()) {
    for (const [cle, valeur] of Object.entries(declaration)) if (valeur !== undefined) sortie[cle] = valeur;
  }
  return sortie as DeclarationDEntree;
}

/**
 * Déclare à la coque d'entrée. Ne rend rien ; hors de la coque (un test isolé), ne fait rien.
 * `useLayoutEffect` : sur une navigation douce, la barre est juste AVANT la peinture.
 */
export function DeclarerEntree(declaration: DeclarationDEntree) {
  const declarer = useContext(ContexteDeclarer);
  return declarer ? <Declarant declarer={declarer} declaration={declaration} /> : null;
}

function Declarant({ declarer, declaration }: { readonly declarer: Declarer; readonly declaration: DeclarationDEntree }) {
  const id = useId();
  const { titre, pas, total, saisie, reprise, pied, objet } = declaration;
  useLayoutEffect(() => {
    declarer(id, { titre, pas, total, saisie, reprise, pied, objet });
  }, [declarer, id, titre, pas, total, saisie, reprise, pied, objet]);
  useLayoutEffect(() => () => declarer(id, null), [declarer, id]);
  return null;
}

/** L'avancement du parcours : une pastille par écran, la courante allongée (maquette `Pastilles`). */
export function Pastilles({ pas, total, gabarit, className }: { readonly pas: number; readonly total: number; readonly gabarit: string; readonly className?: string }) {
  const libelle = gabarit.replace('{pas}', String(pas)).replace('{total}', String(total));
  return (
    <span role="img" aria-label={libelle} className={cn('flex items-center gap-1', className)}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn('h-1.5 rounded-full', i + 1 === pas ? 'w-4 bg-primary' : i + 1 < pas ? 'w-1.5 bg-primary' : 'w-1.5 bg-foreground/15')}
        />
      ))}
    </span>
  );
}

function Marque({ nom, className }: { readonly nom: string; readonly className?: string }) {
  return (
    <NextLink
      href="/"
      className={cn('inline-flex rounded-md py-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring', className)}
    >
      <Logo nom={nom} />
    </NextLink>
  );
}

const CLASSES_LIEN_TEXTE =
  'inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';

export function CoqueDEntree({
  libelles,
  retour,
  sortie,
  largeur = 'etroite',
  densiteDesChamps = false,
  children,
  ...parDefaut
}: CoqueDEntreeProps) {
  const [declarations, setDeclarations] = useState<ReadonlyMap<string, DeclarationDEntree>>(() => new Map());
  const [declarer] = useState<Declarer>(() => (id: string, declaration: DeclarationDEntree | null) => {
    setDeclarations((avant) => {
      if (declaration === null && !avant.has(id)) return avant;
      const apres = new Map(avant);
      if (declaration === null) apres.delete(id);
      else apres.set(id, declaration);
      return apres;
    });
  });
  const declaree = fusionner(declarations);
  const titre = declaree.titre ?? parDefaut.titre;
  const pas = declaree.pas ?? parDefaut.pas;
  const total = declaree.total ?? parDefaut.total;
  const pied = declaree.pied ?? parDefaut.pied;
  const objet = declaree.objet ?? parDefaut.objet;
  const saisie = declaree.saisie === true;

  const decalage = useDecalageDuClavier();

  // La sortie retenue tant qu'on n'a pas confirmé : le lien lui-même, rejoué après « Quitter ».
  const [enAttente, setEnAttente] = useState<HTMLAnchorElement | null>(null);
  const laisserPasser = useRef(false);

  function auClicDeSortie(evenement: MouseEvent<HTMLAnchorElement>) {
    if (!saisie || laisserPasser.current) return;
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey || evenement.button !== 0) return;
    evenement.preventDefault();
    setEnAttente(evenement.currentTarget);
  }

  function partir() {
    const lien = enAttente;
    setEnAttente(null);
    if (!lien) return;
    laisserPasser.current = true;
    try {
      lien.click();
    } finally {
      laisserPasser.current = false;
    }
  }

  const avancement = pas && total ? <Pastilles pas={pas} total={total} gabarit={libelles.avancement} /> : null;
  const retourAuSite =
    sortie?.forme === 'retour-au-site' ? (
      <NextLink href={sortie.href} onClick={auClicDeSortie} className={CLASSES_LIEN_TEXTE}>
        {libelles.retourAuSite}
      </NextLink>
    ) : null;

  return (
    <ContexteDeclarer.Provider value={declarer}>
      <div className="flex min-h-dvh flex-col bg-background" data-coque-d-entree="">
        {/* Téléphone : 56 px — retour, « ✕ » ou la marque ; l'intention ; l'avancement, la sortie. */}
        <header className="sticky top-0 z-20 flex h-14 flex-none items-center gap-1 border-b border-border/70 bg-background px-1 lg:hidden">
          {retour ? (
            retour.telephone
          ) : sortie?.forme === 'quitter' ? (
            <NextLink
              href={sortie.href}
              onClick={auClicDeSortie}
              aria-label={libelles.fermer}
              className="inline-flex size-11 flex-none items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-5" aria-hidden="true" />
            </NextLink>
          ) : (
            <Marque nom={libelles.marque} className="ml-3" />
          )}
          {/* L'intention au téléphone quand la barre s'ouvre sur un retour ou « ✕ » (maquettes
              `BarreEntree`, `EnTeteFormulaire`) ; ouverte sur la marque, la barre n'a que la marque et
              l'avancement (orientation a-0/a-1) — l'intention passe à la barre du bureau. */}
          {titre && (retour || sortie?.forme === 'quitter') ? (
            <p className="min-w-0 flex-1 truncate text-action font-semibold">{titre}</p>
          ) : retour ? (
            // `first:pl-3` : là où le retour ne paraît pas (vérification d'e-mail, réinitialisation,
            // retour OAuth), la marque ouvre la barre et garde la marge de la maquette.
            <span className="flex flex-1 items-center first:pl-3">
              <Marque nom={libelles.marque} />
            </span>
          ) : (
            <span className="flex-1" />
          )}
          {avancement || retourAuSite ? (
            <span className="flex flex-none items-center gap-2 pr-3">
              {avancement}
              {retourAuSite}
            </span>
          ) : null}
        </header>

        {/* Bureau : 64 px — retour et marque ; l'intention et l'avancement au centre ; la sortie. */}
        <header className="sticky top-0 z-20 hidden h-16 flex-none items-center border-b border-border bg-background px-8 lg:flex">
          <div className="flex flex-1 items-center gap-5">
            {retour ? retour.bureau : null}
            <Marque nom={libelles.marque} />
          </div>
          {titre ? (
            <div className="flex items-center gap-3.5">
              <p className="text-corps font-semibold">{titre}</p>
              {avancement}
            </div>
          ) : null}
          <div className="flex flex-1 items-center justify-end gap-4">
            {sortie?.forme === 'quitter' ? (
              <NextLink
                href={sortie.href}
                onClick={auClicDeSortie}
                className="inline-flex h-9 items-center justify-center rounded-full border border-input/45 bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                {libelles.quitter}
              </NextLink>
            ) : (
              retourAuSite
            )}
          </div>
        </header>

        <main {...(densiteDesChamps ? fieldDensityScope() : {})} className="flex-1 px-4 pb-8 pt-5 lg:px-8 lg:pb-16 lg:pt-16">
          {/* Sous 1280, la colonne et l'objet s'empilent : aucun panneau ne reste à côté du contenu. */}
          <div className={cn('mx-auto w-full', objet ? 'xl:flex xl:max-w-[65rem] xl:items-start xl:gap-20' : null)}>
            <div className={cn('mx-auto w-full', largeur === 'etroite' ? 'max-w-[30rem]' : 'max-w-4xl', objet ? 'xl:mx-0 xl:w-[30rem] xl:flex-none' : null)}>
              {children}
            </div>
            {objet ? (
              <aside data-objet-de-l-intention="" className="mx-auto mt-10 hidden w-full max-w-[30rem] lg:block xl:sticky xl:top-24 xl:mt-0 xl:max-w-none xl:min-w-0 xl:flex-1">
                {objet}
              </aside>
            ) : null}
          </div>
        </main>

        {pied ? (
          // Téléphone : collé en bas, et remonté de ce que le clavier cache (`visualViewport`). Au
          // bureau, sous la colonne, dans le flux.
          <div
            data-pied-d-entree=""
            style={{ bottom: decalage }}
            className="sticky z-20 flex-none border-t border-border bg-card px-4 pb-5 pt-3 shadow-barre-collante lg:static lg:mx-auto lg:w-full lg:max-w-[30rem] lg:border-0 lg:bg-transparent lg:px-0 lg:pb-16 lg:pt-0 lg:shadow-none"
          >
            {pied}
          </div>
        ) : null}
      </div>

      {enAttente ? (
        <Dialog open onOpenChange={(ouvert) => (ouvert ? null : setEnAttente(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{libelles.sortie.titre}</DialogTitle>
              <DialogDescription>{declaree.reprise ?? libelles.sortie.texte}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={partir}>
                {libelles.sortie.partir}
              </Button>
              <Button type="button" onClick={() => setEnAttente(null)}>
                {libelles.sortie.rester}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </ContexteDeclarer.Provider>
  );
}
