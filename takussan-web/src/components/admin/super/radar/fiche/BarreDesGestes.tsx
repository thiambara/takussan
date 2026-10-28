'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import type { GestesFiche } from './useGestesFiche';

interface BarreDesGestesProps {
  readonly gestes: GestesFiche;
  readonly stoppee: boolean;
  readonly onDoublon: () => void;
  readonly onEcarter: () => void;
}

function Raccourci({ children }: { readonly children: string }) {
  return (
    <kbd className="ml-1.5 rounded border bg-muted px-1 font-sans text-[0.7rem] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

/**
 * TCK-2387 — les trois gestes de la fiche, chacun avec son raccourci affiché et déclaré
 * (`aria-keyshortcuts`) : valider (`⌘/Ctrl + Entrée`, actif même dans un champ), doublon (`D`) et écarter
 * (`E`), ces deux-là hors d'une zone de saisie. Les raccourcis eux-mêmes vivent dans
 * {@link useRaccourcisFiche} ; ici, les boutons — le seul recours à la souris et au tactile.
 */
export function BarreDesGestes({ gestes, stoppee, onDoublon, onEcarter }: BarreDesGestesProps) {
  const t = useTranslations('superAdmin.pages.radar.listing.gestures');
  const aucun = !gestes.peutValider && !gestes.peutFermer;

  return (
    <div role="group" aria-label={t('label')} className="flex flex-wrap items-center gap-2 sm:ml-auto" data-testid="radar-gestes">
      {aucun ? (
        <p className="text-sm text-muted-foreground">{stoppee ? t('doNotContact') : t('unavailable')}</p>
      ) : null}
      <Button
        type="button"
        disabled={!gestes.peutValider || gestes.enCours}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        onClick={() => void gestes.valider()}
      >
        {gestes.enCours ? t('working') : t('validate')}
        <Raccourci>{t('validateKeys')}</Raccourci>
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!gestes.peutFermer || gestes.enCours}
        aria-keyshortcuts="D"
        onClick={onDoublon}
      >
        {t('duplicate')}
        <Raccourci>D</Raccourci>
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!gestes.peutFermer || gestes.enCours}
        aria-keyshortcuts="E"
        onClick={onEcarter}
      >
        {t('discard')}
        <Raccourci>E</Raccourci>
      </Button>
    </div>
  );
}
