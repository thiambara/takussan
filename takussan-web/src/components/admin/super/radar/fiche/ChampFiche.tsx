'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { RadarExtractedField } from '@/types/radar';
import { etatDuChamp } from './confiance';
import { localiserPassage } from './passage';

export interface ChampFicheProps {
  /** La clé du champ (`price`, `neighborhood`…) : sert d'identifiant de test et de repère. */
  readonly nom: string;
  readonly libelle: string;
  /** Le champ tel que le modèle l'a lu ; absent d'une extraction partielle. */
  readonly champ?: RadarExtractedField<unknown>;
  /** L'opérateur a une correction en cours sur ce champ. */
  readonly modifie: boolean;
  /** Le texte source, s'il y en a un (`raw_text`) : sans lui, le passage cité s'affiche sous le champ. */
  readonly texteSource: string | null;
  /** Survol ou focus : le passage cité à montrer dans la source (`null` : plus aucun). */
  readonly surPassage: (passage: string | null) => void;
  readonly aide?: ReactNode;
  /** Le champ porte plusieurs contrôles (le quartier) : le libellé nomme le groupe, pas un contrôle. */
  readonly groupe?: boolean;
  readonly className?: string;
  /** Le contrôle ; reçoit l'`id` que le libellé désigne et `aria-describedby`. */
  readonly children: (props: { readonly id: string; readonly decritPar: string }) => ReactNode;
}

/**
 * TCK-2387 — un champ de la fiche : libellé, contrôle, et ce que la lecture en dit.
 *
 * - `low` ou drapeau : bordure, icône d'avertissement et libellé de chaque drapeau ;
 * - `medium` : une mention discrète ;
 * - `high` : rien ;
 * - corrigé : « corrigé », et plus d'alarme.
 *
 * Survoler le champ, ou y mettre le focus clavier (l'un vaut l'autre), demande à la source de
 * surligner le passage que le modèle cite à l'appui. Quand la source ne peut pas le montrer (captures,
 * ou passage absent du texte), le passage s'affiche ici, sous le champ.
 */
export function ChampFiche({ nom, libelle, champ, modifie, texteSource, surPassage, aide, groupe = false, className, children }: ChampFicheProps) {
  const t = useTranslations('superAdmin.pages.radar.listing');
  const id = useId();
  const decritPar = `${id}-note`;
  const etat = etatDuChamp(champ, modifie);
  const passage = champ?.evidence ?? null;
  const passageSousChamp = passage !== null && (texteSource === null || localiserPassage(texteSource, passage) === null);

  return (
    <div
      className={cn(
        'space-y-1.5 rounded-lg border p-3',
        etat.niveau === 'alerte' ? 'border-warning bg-warning/5' : 'border-transparent',
        className,
      )}
      role={groupe ? 'group' : undefined}
      aria-labelledby={groupe ? `${id}-libelle` : undefined}
      data-testid={`champ-${nom}`}
      data-confiance={champ?.confidence}
      data-alerte={etat.niveau === 'alerte' ? 'true' : undefined}
      onMouseEnter={() => surPassage(passage)}
      onMouseLeave={() => surPassage(null)}
      onFocus={() => surPassage(passage)}
      onBlur={() => surPassage(null)}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {groupe ? (
          <span id={`${id}-libelle`} className="text-sm leading-none font-medium text-foreground">{libelle}</span>
        ) : (
          <Label htmlFor={id}>{libelle}</Label>
        )}
        {etat.corrige ? (
          <span className="text-xs font-medium text-info">{t('confidence.corrected')}</span>
        ) : null}
        {etat.niveau === 'discret' ? (
          <span className="text-xs text-muted-foreground">{t('confidence.medium')}</span>
        ) : null}
      </div>
      {children({ id, decritPar })}
      <div id={decritPar} className="space-y-1 empty:hidden">
        {etat.niveau === 'alerte' ? (
          <ul className="space-y-0.5" aria-label={t('confidence.warning')}>
            {(etat.drapeaux.length > 0 ? etat.drapeaux : [null]).map((drapeau) => (
              <li key={drapeau ?? 'low'} className="flex items-start gap-1.5 text-xs font-medium text-warning">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {drapeau ? t(`confidence.flags.${drapeau}`) : t('confidence.low')}
              </li>
            ))}
          </ul>
        ) : null}
        {aide ? <p className="text-xs text-muted-foreground">{aide}</p> : null}
        {passageSousChamp ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">{t('source.cited')} : </span>
            <q>{passage}</q>
          </p>
        ) : null}
      </div>
    </div>
  );
}
