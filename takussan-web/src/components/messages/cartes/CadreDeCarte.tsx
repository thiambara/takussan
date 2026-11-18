'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { cn } from '@/lib/utils';

/**
 * TCK-2962 — le cadre d'une carte du fil (maquette `fil-cartes`, approche D, décision du porteur) : un
 * aplat de la palette Lin SANS bordure, sans barre d'accent ni liseré d'état, sans puce-icône devant le
 * titre, sans pastille. Un sur-titre qui dit la nature et l'objet, l'état EN MOTS à droite (encre
 * profonde quand il attend CE lecteur, vert quand c'est fait), le contenu, UN seul geste principal, les
 * autres gestes en liens, et une trace d'une ligne.
 */
export type TonDeLaCarte = 'calme' | 'attend' | 'fait' | 'alerte';

export interface CadreDeCarteProps {
  readonly quoi: ReactNode;
  readonly etat?: ReactNode;
  readonly ton?: TonDeLaCarte;
  readonly children?: ReactNode;
  /** Le seul geste plein de la carte. */
  readonly geste?: ReactNode;
  /** Les autres gestes, en liens. */
  readonly liens?: ReactNode;
  /** Ce qui suit le geste une fois fait, ou une précision : une ligne discrète. */
  readonly trace?: ReactNode;
  /** Le refus ou l'échec du dernier geste. */
  readonly erreur?: ReactNode;
  readonly type?: string;
  /** TCK-2964 — la photo en tête (le bien partagé, maquette `BienD`), DANS l'aplat : ses coins suivent ceux de la carte. */
  readonly media?: ReactNode;
}

export function CadreDeCarte({ quoi, etat, ton = 'calme', children, geste, liens, trace, erreur, type, media }: CadreDeCarteProps) {
  return (
    <article data-slot="carte-du-fil" data-type={type} data-ton={ton} className="overflow-hidden rounded-2xl bg-muted/80">
      {media}
      <div className="px-4 pt-3.5 pb-4">
        <p className="flex items-baseline gap-3 text-ui">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{quoi}</span>
          {etat ? (
            <span
              data-slot="etat-de-la-carte"
              className={cn(
                'flex flex-none items-center gap-1',
                ton === 'attend' && 'font-medium text-primary-deep',
                ton === 'fait' && 'font-medium text-success',
                ton === 'alerte' && 'font-medium text-destructive',
                ton === 'calme' && 'text-muted-foreground',
              )}
            >
              {ton === 'fait' ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" /> : null}
              {etat}
            </span>
          ) : null}
        </p>
        {children ? <div className="mt-2">{children}</div> : null}
        {geste ? <div className="mt-4">{geste}</div> : null}
        {liens ? <div className="mt-2 flex flex-wrap justify-center gap-x-4">{liens}</div> : null}
        {erreur ? (
          <p role="alert" className="mt-2 text-ui leading-snug text-destructive">
            {erreur}
          </p>
        ) : null}
        {trace ? <p className="mt-3 text-ui leading-snug text-muted-foreground">{trace}</p> : null}
      </div>
    </article>
  );
}

/** Le chiffre clé : Bricolage, grand, serré, en chiffres tabulaires. */
export function Chiffre({ children, discret }: { readonly children: ReactNode; readonly discret?: boolean }) {
  return (
    <p data-slot="chiffre-de-la-carte" className={cn('font-display text-affiche-28 leading-none font-semibold tracking-titre tabular-nums', discret && 'text-muted-foreground')}>
      {children}
    </p>
  );
}

export function TitreDeCarte({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <p className={cn('font-display text-titre-court leading-tight font-semibold tracking-titre', className)}>{children}</p>;
}

export function TexteDeCarte({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <p className={cn('mt-1.5 text-corps leading-snug text-foreground', className)}>{children}</p>;
}

/** Le geste principal : pleine largeur, 48 px, au pouce. */
export const CLASSE_DU_GESTE = 'h-controle-action w-full rounded-full text-corps font-semibold';

/** Un geste second, en lien texte (au moins 40 px de haut pour le pouce). */
export function LienDeCarte({
  children,
  onClick,
  disabled,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center rounded-sm text-ui font-medium text-foreground underline decoration-border decoration-1 underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/** La classe d'un lien de navigation (vers la fiche de l'objet), au même aspect que {@link LienDeCarte}. */
export const CLASSE_DU_LIEN =
  'inline-flex min-h-10 items-center rounded-sm text-ui font-medium text-foreground underline decoration-border decoration-1 underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring';

/**
 * Le texte du refus d'un geste : un 403 dit que le geste n'est plus permis (la carte se relit) ; toute
 * autre erreur passe par le libellé du code d'erreur de l'API, ou le repli de la carte.
 */
export function useErreurDuGeste(): (erreur: unknown) => string | null {
  const t = useTranslations('messaging.cartes');
  const messageErreur = useMessageErreurApi();
  return (erreur) => {
    if (!erreur) return null;
    if (erreur instanceof ApiError && erreur.status === 403) return t('refusDuGeste');
    return messageErreur(erreur, t('echecDuGeste'));
  };
}
