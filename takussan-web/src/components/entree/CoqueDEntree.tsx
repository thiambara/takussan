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
  /**
   * TCK-2604 — le titre de la seule barre du bureau, quand il diffère de celui du téléphone : entre 1024
   * et 1280, la barre de 64 px dit l'action ET le bien (« Votre demande de visite · Studio meublé »), que
   * le panneau dit dès 1280 et l'en-tête du téléphone jusqu'à 1024. Absent : `titre`.
   */
  readonly titreDeBureau?: string;
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
  /**
   * TCK-2604 — l'en-tête du téléphone, À LA PLACE de la barre de 56 px : la photo du bien quitté
   * (176 px, `EnTeteBien`) ou la barre du bien (`BarreIntention`). Il défile avec la page — collé,
   * il mangerait la place que le clavier laisse.
   */
  readonly enTete?: ReactNode;
  /**
   * TCK-2604 — au bureau LARGE (dès `xl`, 1280 px : « Bureau (≥ 1280 px) » du ticket), le panneau de
   * GAUCHE de la maquette `DeuxColonnes` : 45 % de la largeur, pleine hauteur, et la barre passe dans
   * la colonne de droite (retour à gauche, marque à droite), au-dessus d'un formulaire de 400 px. Un
   * pourcentage, jamais une piste fixe. Entre 1024 et 1280, pas de panneau : la coque est celle d'une
   * page sans panneau (barre de 64 px, `retourBureau` compris, colonne de 480 px).
   */
  readonly panneau?: ReactNode;
  /** La pastille de retour du bureau, quand la page en dit une plus juste (« Retour à l'annonce »). */
  readonly retourBureau?: ReactNode;
  /**
   * TCK-2600 — la page remplit l'écran sous la barre (l'assistant de publication) : la coque devient
   * une boîte bornée (`h-dvh`), sans colonne ni marges, et la page gère son défilement et son pied.
   */
  readonly pleinEcran?: boolean;
  /** TCK-2600 — au bureau, avant la sortie : l'état du brouillon (« Brouillon gardé dans ce navigateur »). */
  readonly noteDeBarre?: ReactNode;
  /**
   * TCK-2601 (AC5) — la page tient une tâche à finir à côté de la barre (le panneau de compte de
   * `/publish`, au bureau, que plus aucun voile ne couvre ; ses écritures) : la sortie et la marque
   * sont inertes — `aria-disabled`, hors de la tabulation, le clic ne mène nulle part.
   */
  readonly sortieBloquee?: boolean;
  /**
   * TCK-2611 — l'objet à GAUCHE au bureau large (dès `xl`, maquette `app-entree-invitation`,
   * `DeuxColonnes`) : 1080 px au plus, l'objet en piste souple, le formulaire en colonne de 400 px à
   * droite. Sous 1280, l'objet n'est pas rendu : la page le dit elle-même dans sa colonne (l'agence qui
   * invite, au téléphone). Absent : l'objet reste à droite de la colonne, ou dessous (TCK-2598).
   */
  readonly objetAGauche?: boolean;
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
  const { titre, titreDeBureau, pas, total, saisie, reprise, pied, objet, enTete, panneau, retourBureau, pleinEcran, noteDeBarre, sortieBloquee, objetAGauche } = declaration;
  useLayoutEffect(() => {
    declarer(id, { titre, titreDeBureau, pas, total, saisie, reprise, pied, objet, enTete, panneau, retourBureau, pleinEcran, noteDeBarre, sortieBloquee, objetAGauche });
  }, [declarer, id, titre, titreDeBureau, pas, total, saisie, reprise, pied, objet, enTete, panneau, retourBureau, pleinEcran, noteDeBarre, sortieBloquee, objetAGauche]);
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

/** TCK-2601 (AC5) — un lien de sortie inerte : annoncé désactivé, hors de la tabulation, le clic retenu. */
const PROPS_INERTES = {
  'aria-disabled': true,
  tabIndex: -1,
  onClick: (evenement: MouseEvent<HTMLAnchorElement>) => evenement.preventDefault(),
} as const;

function Marque({ nom, className, bloquee = false }: { readonly nom: string; readonly className?: string; readonly bloquee?: boolean }) {
  return (
    <NextLink
      href="/"
      {...(bloquee ? PROPS_INERTES : {})}
      className={cn('inline-flex rounded-md py-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring aria-disabled:pointer-events-none aria-disabled:opacity-50', className)}
    >
      <Logo nom={nom} />
    </NextLink>
  );
}

const CLASSES_LIEN_TEXTE =
  'inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';
/** TCK-2601 (AC5) — une sortie inerte se voit (`sortieBloquee`). */
const CLASSES_INERTES = 'aria-disabled:pointer-events-none aria-disabled:opacity-50';

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
  const titreDeBureau = declaree.titreDeBureau ?? parDefaut.titreDeBureau ?? titre;
  const pas = declaree.pas ?? parDefaut.pas;
  const total = declaree.total ?? parDefaut.total;
  const pied = declaree.pied ?? parDefaut.pied;
  const objet = declaree.objet ?? parDefaut.objet;
  const enTete = declaree.enTete ?? parDefaut.enTete;
  const panneau = declaree.panneau ?? parDefaut.panneau;
  const retourBureau = declaree.retourBureau ?? parDefaut.retourBureau ?? retour?.bureau;
  const saisie = declaree.saisie === true;
  const pleinEcran = declaree.pleinEcran === true;
  const noteDeBarre = declaree.noteDeBarre ?? null;
  const sortieBloquee = declaree.sortieBloquee === true;
  const objetAGauche = declaree.objetAGauche === true || parDefaut.objetAGauche === true;

  const decalage = useDecalageDuClavier();

  // La sortie retenue tant qu'on n'a pas confirmé : le lien lui-même, rejoué après « Quitter ».
  const [enAttente, setEnAttente] = useState<HTMLAnchorElement | null>(null);
  const laisserPasser = useRef(false);

  function auClicDeSortie(evenement: MouseEvent<HTMLAnchorElement>) {
    if (sortieBloquee) {
      evenement.preventDefault();
      return;
    }
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

  // La sortie garde `auClicDeSortie` (qui retient aussi le clic bloqué) : seuls l'annonce et la tabulation s'ajoutent.
  const inerte = sortieBloquee ? { 'aria-disabled': true, tabIndex: -1 } : {};
  const avancement = pas && total ? <Pastilles pas={pas} total={total} gabarit={libelles.avancement} /> : null;
  const retourAuSite =
    sortie?.forme === 'retour-au-site' ? (
      <NextLink href={sortie.href} onClick={auClicDeSortie} {...inerte} className={cn(CLASSES_LIEN_TEXTE, CLASSES_INERTES)}>
        {libelles.retourAuSite}
      </NextLink>
    ) : null;

  return (
    <ContexteDeclarer.Provider value={declarer}>
      <div className={cn('flex bg-background', pleinEcran ? 'h-dvh' : 'min-h-dvh')} data-coque-d-entree="">
        {panneau ? (
          <aside
            data-panneau-d-entree=""
            className="sticky top-0 hidden h-dvh w-[45%] flex-none self-start overflow-hidden xl:block"
          >
            {panneau}
          </aside>
        ) : null}
        <div className={cn('flex min-w-0 flex-1 flex-col', pleinEcran && 'min-h-0')}>
          {enTete ? (
            <div data-en-tete-d-entree="" className="flex-none lg:hidden">
              {enTete}
            </div>
          ) : (
            /* Téléphone : 56 px — retour, « ✕ » ou la marque ; l'intention ; l'avancement, la sortie. */
            <header className="sticky top-0 z-20 flex h-14 flex-none items-center gap-1 border-b border-border/70 bg-background px-1 lg:hidden">
              {retour ? (
                retour.telephone
              ) : sortie?.forme === 'quitter' ? (
                <NextLink
                  href={sortie.href}
                  onClick={auClicDeSortie}
                  {...inerte}
                  aria-label={libelles.fermer}
                  className={cn('inline-flex size-11 flex-none items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', CLASSES_INERTES)}
                >
                  <X className="size-5" aria-hidden="true" />
                </NextLink>
              ) : (
                <Marque nom={libelles.marque} className="ml-3" bloquee={sortieBloquee} />
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
                  <Marque nom={libelles.marque} bloquee={sortieBloquee} />
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
          )}

          {panneau ? (
            /* Bureau large à deux colonnes (`DeuxColonnes`) : la barre de la colonne de droite, sans filet. */
            <header className="hidden h-16 flex-none items-center justify-between px-10 xl:flex">
              {retourBureau ?? <span />}
              <Marque nom={libelles.marque} bloquee={sortieBloquee} />
            </header>
          ) : null}
          {/* Bureau : 64 px — retour et marque ; l'intention et l'avancement au centre ; la sortie.
              Avec un panneau, elle ne sert qu'entre 1024 et 1280, où le panneau ne paraît pas. */}
          <header
            className={cn(
              'sticky top-0 z-20 hidden h-16 flex-none items-center border-b border-border bg-background px-8 lg:flex',
              panneau ? 'xl:hidden' : null,
            )}
          >
            <div className="flex flex-1 items-center gap-5 whitespace-nowrap">
              {retourBureau ?? null}
              <Marque nom={libelles.marque} bloquee={sortieBloquee} />
            </div>
            {titreDeBureau ? (
              /* Le titre seul se tronque : le retour et la marque gardent leur ligne (`whitespace-nowrap`), un titre long
                 ne repliait pas le titre mais la pastille « Retour à l’annonce », sur deux lignes, collée à la marque. */
              <div className="mx-6 flex min-w-0 items-center gap-3.5">
                <p className="truncate text-corps font-semibold">{titreDeBureau}</p>
                {avancement}
              </div>
            ) : null}
            <div className="flex flex-1 items-center justify-end gap-4">
              {noteDeBarre}
              {sortie?.forme === 'quitter' ? (
                <NextLink
                  href={sortie.href}
                  onClick={auClicDeSortie}
                  {...inerte}
                  className={cn('inline-flex h-9 items-center justify-center rounded-full border border-input/45 bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring', CLASSES_INERTES)}
                >
                  {libelles.quitter}
                </NextLink>
              ) : (
                retourAuSite
              )}
            </div>
          </header>

          {pleinEcran ? (
            <main {...(densiteDesChamps ? fieldDensityScope() : {})} className="flex min-h-0 flex-1 flex-col">
              {children}
            </main>
          ) : (
          <main
            {...(densiteDesChamps ? fieldDensityScope() : {})}
            className={cn('flex-1 px-4 pb-8 pt-5', 'lg:px-8 lg:pb-16 lg:pt-16', panneau ? 'xl:px-10 xl:pt-12' : null)}
          >
            {/* Sous 1280, la colonne et l'objet s'empilent : aucun panneau ne reste à côté du contenu. */}
            <div
              className={cn(
                'mx-auto w-full',
                objet && !panneau ? (objetAGauche ? 'xl:flex xl:max-w-[67.5rem] xl:items-start xl:gap-20' : 'xl:flex xl:max-w-[65rem] xl:items-start xl:gap-20') : null,
              )}
            >
              {objet && !panneau && objetAGauche ? (
                // TCK-2611 — à gauche dès 1280, absent en dessous (la page le dit dans sa colonne).
                <aside data-objet-de-l-intention="" className="hidden min-w-0 xl:block xl:flex-1">
                  {objet}
                </aside>
              ) : null}
              <div
                className={cn(
                  'mx-auto w-full',
                  largeur === 'etroite' ? 'max-w-[30rem]' : 'max-w-4xl',
                  panneau ? 'xl:max-w-[25rem]' : objet ? (objetAGauche ? 'xl:mx-0 xl:w-[25rem] xl:flex-none xl:pt-4' : 'xl:mx-0 xl:w-[30rem] xl:flex-none') : null,
                )}
              >
                {children}
              </div>
              {objet && !panneau && !objetAGauche ? (
                <aside data-objet-de-l-intention="" className="mx-auto mt-10 hidden w-full max-w-[30rem] lg:block xl:sticky xl:top-24 xl:mt-0 xl:max-w-none xl:min-w-0 xl:flex-1">
                  {objet}
                </aside>
              ) : null}
            </div>
          </main>
          )}

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
