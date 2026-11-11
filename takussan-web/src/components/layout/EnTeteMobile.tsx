'use client';

import type { ReactNode } from 'react';
import { Ellipsis, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LienFlecheDeRetour } from '@/components/navigation-publique/FlecheDeRetour';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import type { FormeDEnTete } from '@/lib/navigation/en-tete-de-la-coque';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user';
import { MenuDuCompte } from './MenuDuCompte';
import { NotificationBell } from './NotificationBell';
import { FOCUS_RING } from './styles-de-la-barre';
import { raccourciDeLaPalette, useSurApple } from './useSurApple';

interface EnTeteMobileProps {
  /** La forme (décision 5 (a) du porteur) : route, puis déclaration de la page. Défaut : `racine`. */
  readonly forme?: FormeDEnTete;
  /** Le titre : le H1 d'une racine, le nom court d'un détail ou d'un formulaire. */
  readonly titre?: string | null;
  /** Où mène le retour (détail) ou le « ✕ » (plein écran) quand rien du site ne précède la page. */
  readonly repli?: string | null;
  /** Racine : 0 ou 1 action de page, un bouton icône de 40 px (`ActionDEnTete`). */
  readonly action?: ReactNode;
  /** Détail : les actions secondaires de la page, dans la feuille de « ⋯ ». Absentes : pas de « ⋯ ». */
  readonly actions?: ReactNode;
  /** Plein écran : « Étape n sur total ». */
  readonly etape?: { readonly n: number; readonly total: number };
  /** Plein écran : une ligne sous le titre à la place de l'étape (« Visite de 10:00 · terminée à 10:35 », TCK-2581). */
  readonly sousTitre?: string;
  /** Plein écran : ce qui se pose à droite du titre (« Passer », TCK-2581). */
  readonly droite?: ReactNode;
  /** Accueil : le compte et le persona affiché, pour l'espace en bouton (le menu du compte). */
  readonly compte?: { readonly user: User; readonly libelleRole: string };
  /** Ouvre la palette de commandes, depuis ce bouton (le focus lui revient). Absent : pas de bouton. */
  readonly onOuvrirPalette?: (depuis: HTMLElement) => void;
}

/** Le bouton icône de l'en-tête : 40 px, icône de 20 au trait 1,75, à l'encre douce (TCK-2691, C5). */
const BOUTON_D_EN_TETE =
  'inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-encre-douce transition-colors hover:bg-foreground/5 hover:text-foreground';

/**
 * TCK-2617 (décision 5 (a) du porteur, ADR-0090) — l'en-tête du TÉLÉPHONE de `/app` : 56 px, collé en
 * haut (enfant de la coque `h-dvh`, il ne défile pas), sans logo. Quatre formes, celles de la maquette
 * `app-coque` (`chrome-app.tsx`, références gelées `a-0`, `a-1`, `a-2`) :
 *
 * - `racine` — le titre de la page à gauche, et c'est LE `<h1>` sous `md` (celui du contenu y est
 *   masqué, `globals.css`) ; à droite : l'action de page, « Aller à », la cloche ;
 * - `accueil` — l'espace en bouton (le menu du compte) ; le salut reste le H1, dans le contenu ;
 * - `detail` — la flèche de retour (`LienFlecheDeRetour`, celle du site public : une seule flèche),
 *   un titre court de 17 px, « ⋯ » quand la page a des actions secondaires ; ni cloche ni palette ;
 * - `plein-ecran` — « ✕ », le titre et l'étape ; la barre d'onglets n'est pas rendue.
 *
 * Dès `md`, rien : la colonne porte la marque, la cloche et le compte, le H1 reste dans le contenu.
 */
export function EnTeteMobile({
  forme = 'racine',
  titre,
  repli,
  action,
  actions,
  etape,
  sousTitre,
  droite,
  compte,
  onOuvrirPalette,
}: EnTeteMobileProps) {
  const tPalette = useTranslations('nav.palette');
  const tCoque = useTranslations('nav.coque');
  const surApple = useSurApple();

  const outils = (
    <>
      {onOuvrirPalette ? (
        <button
          type="button"
          data-slot="ouvrir-palette"
          onClick={(event) => onOuvrirPalette(event.currentTarget)}
          aria-label={tPalette('titre')}
          // Une fenêtre étroite de bureau a un clavier : le raccourci y ouvre aussi la palette.
          aria-keyshortcuts={raccourciDeLaPalette(surApple)}
          className={cn(BOUTON_D_EN_TETE, FOCUS_RING)}
        >
          <Search className="size-5" strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
      <NotificationBell align="end" emplacement="en-tete" />
    </>
  );

  const base = 'flex h-14 shrink-0 items-center gap-1 border-b border-border/70 bg-background md:hidden';

  if (forme === 'detail' || forme === 'plein-ecran') {
    return (
      <header data-slot="en-tete-mobile" data-forme={forme} className={cn(base, 'px-1')}>
        {forme === 'detail' ? (
          repli ? <LienFlecheDeRetour repli={repli} libelle={tCoque('retour')} /> : null
        ) : (
          <LienLocalise
            href={repli ?? '/app'}
            aria-label={tCoque('fermer')}
            className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted', FOCUS_RING)}
          >
            <X className="size-5" aria-hidden />
          </LienLocalise>
        )}
        {forme === 'detail' ? (
          <p className="min-w-0 flex-1 truncate text-titre-court font-semibold text-foreground">{titre}</p>
        ) : (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-action font-semibold text-foreground">{titre}</p>
            {sousTitre ? (
              <p className="truncate text-ui text-muted-foreground">{sousTitre}</p>
            ) : etape ? (
              <p className="text-ui text-muted-foreground">{tCoque('etape', etape)}</p>
            ) : null}
          </div>
        )}
        {forme === 'plein-ecran' && droite ? <div className="flex shrink-0 items-center">{droite}</div> : null}
        {forme === 'detail' && actions ? (
          <FeuilleDuBas
            titre={titre ?? tCoque('plusDActions')}
            declencheur={
              <button
                type="button"
                data-slot="plus-d-actions"
                aria-label={tCoque('plusDActions')}
                className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted', FOCUS_RING)}
              >
                <Ellipsis className="size-5 stroke-2" aria-hidden />
              </button>
            }
          >
            {actions}
          </FeuilleDuBas>
        ) : null}
      </header>
    );
  }

  if (forme === 'accueil' && compte) {
    return (
      <header data-slot="en-tete-mobile" data-forme="accueil" className={cn(base, 'pl-3 pr-1.5')}>
        <MenuDuCompte user={compte.user} libelleRole={compte.libelleRole} variante="en-tete" />
        {outils}
      </header>
    );
  }

  return (
    <header data-slot="en-tete-mobile" data-forme="racine" className={cn(base, 'pl-4 pr-1.5')}>
      {/* LE H1 de la page sous `md` (le header entier est `md:hidden` : un seul H1 exposé à toute largeur). */}
      <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold tracking-titre text-foreground">{titre}</h1>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
      {outils}
    </header>
  );
}

/**
 * TCK-2617 — l'action de page d'une racine dans l'en-tête du téléphone : un bouton icône de 40 px,
 * « + » primaire plein, ou discret (filtres…). Un lien quand `href` est donné. Les pages l'adoptent
 * dans leurs tickets (`DeclarerEnTete action={…}`).
 */
export function ActionDEnTete({
  libelle,
  icone,
  href,
  onClick,
  primaire = false,
}: {
  readonly libelle: string;
  readonly icone: ReactNode;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly primaire?: boolean;
}) {
  const classes = cn(
    'inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
    primaire ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-encre-douce hover:bg-foreground/5 hover:text-foreground',
    FOCUS_RING,
  );
  return href ? (
    <LienLocalise href={href} aria-label={libelle} className={classes}>
      {icone}
    </LienLocalise>
  ) : (
    <button type="button" aria-label={libelle} onClick={onClick} className={classes}>
      {icone}
    </button>
  );
}
