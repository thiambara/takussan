'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';

import { useChangementDeLangue } from '@/hooks/useChangementDeLangue';
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT } from '@/i18n/config';
import { cn } from '@/lib/utils';

export interface ChoixDeLangueProps {
  readonly className?: string;
  /**
   * La navigation remplace l'entrée d'historique courante au lieu d'en empiler une — pour le menu
   * mobile, dont l'entrée sentinelle ne doit pas rester derrière la page d'arrivée (TCK-551).
   */
  readonly remplacerLEntree?: boolean;
}

/**
 * Le choix de langue en contrôle segmenté FR · EN · WO — TCK-550.
 *
 * Monté dans le menu mobile de `Navbar` et dans le pied de page : sous `lg`, le seul sélecteur de
 * la surface publique (`LanguageSwitcher`, un menu déroulant) vit dans le bloc de bureau
 * `hidden lg:flex`, et n'était donc atteignable nulle part sur téléphone.
 *
 * Trois décisions, chacune tenue par `__tests__/ChoixDeLangue.test.tsx` :
 *
 * · **La mécanique n'est pas réécrite.** Elle vient de `useChangementDeLangue`, partagé avec
 *   `LanguageSwitcher` : cookie et préférence de compte d'abord, puis navigation vers le même
 *   chemin et la même requête sous l'autre préfixe (ADR-0026 §5).
 * · **Chaque langue est nommée dans SA langue** (`LOCALE_LABELS` : « Français », « English »,
 *   « Wolof ») et porte son `lang` : un visiteur qui ne lit pas la langue courante reconnaît la
 *   sienne, et un lecteur d'écran la prononce avec la bonne voix. Le libellé visible (« FR ») est
 *   contenu dans le nom accessible (« Français ») — WCAG 2.5.3, la commande vocale « FR » l'atteint.
 * · **La langue courante est annoncée par `aria-current`**, sur elle seule. C'est la sémantique du
 *   menu de bureau ; `aria-pressed` aurait fait de chaque bouton un interrupteur indépendant.
 *
 * Zones tactiles : `min-h-11 min-w-11`, soit 44 px (WCAG 2.5.5).
 */
export function ChoixDeLangue({ className, remplacerLEntree = false }: ChoixDeLangueProps) {
  const t = useTranslations('common.languageSwitcher');
  const { locale, enCours, choisir } = useChangementDeLangue({ remplacer: remplacerLEntree });
  const idLibelle = useId();

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <span id={idLibelle} className="text-sm font-semibold text-foreground">
        {t('label')}
      </span>
      <div
        role="group"
        aria-labelledby={idLibelle}
        className="inline-flex items-center gap-1 rounded-full p-1 ring-1 ring-inset ring-border"
      >
        {LOCALES.map((code) => {
          const courante = code === locale;
          return (
            <button
              key={code}
              type="button"
              lang={code}
              aria-label={LOCALE_LABELS[code]}
              aria-current={courante ? 'true' : undefined}
              disabled={enCours}
              onClick={() => choisir(code)}
              className={cn(
                'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-60',
                courante
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {LOCALE_SHORT[code]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
