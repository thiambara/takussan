'use client';

import { useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { useChangementDeLangue } from '@/hooks/useChangementDeLangue';
import {
  LOCALES,
  LOCALE_SHORT,
  localeDisplayLabel,
} from '@/i18n/config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type LanguageSwitcherProps = {
  className?: string;
  variant?: 'compact' | 'labelled';
};

/**
 * Le commutateur de langue de BUREAU — [ADR-0026](../../../docs/adr/0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md) §5.
 *
 * Un menu déroulant, monté dans la barre publique de bureau (`Navbar`, bloc `hidden lg:flex`) et
 * dans les barres de la console. Sa mécanique — cookie, préférence de compte, puis navigation vers
 * le même chemin et la même requête sous l'autre préfixe — vit dans `useChangementDeLangue`, qu'il
 * partage avec `ChoixDeLangue`, le contrôle segmenté du menu mobile et du pied de page (TCK-550).
 *
 * ⚠ Ce docblock affirmait jusqu'à TCK-550 que ce composant était monté « dans la Navbar et le pied
 * de page » : le pied de page n'en montait aucun, et sous `lg` aucun choix de langue n'était
 * atteignable (relevé du 2026-09-23).
 */
export function LanguageSwitcher({ className, variant = 'compact' }: LanguageSwitcherProps) {
  const { locale, enCours: isPending, choisir: handleSelect } = useChangementDeLangue();
  const t = useTranslations('common.languageSwitcher');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('label')}
        disabled={isPending}
        className={cn(
          // ⚠ TCK-384 : le filet et le survol étaient des noirs LITTÉRAUX à 5 %, qui ne dessinent
          // rien sur une surface sombre. `--border` et `--muted` sont les deux jetons que ces
          // valeurs approchaient en clair, et ils s'inversent sous `.dark`. Les deux appelants de
          // la barre haute passent leur propre `ring-*` / `hover:bg-*`, que `cn` fait gagner.
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium outline-none ring-1 ring-border transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-60',
          className,
        )}
      >
        <Globe className="size-4" aria-hidden="true" />
        {variant === 'labelled' ? (
          <span>{localeDisplayLabel(locale, locale)}</span>
        ) : (
          <span>{LOCALE_SHORT[locale]}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => handleSelect(code)}
            className={cn(
              'flex items-center justify-between gap-4',
              code === locale && 'font-semibold text-foreground',
            )}
            aria-current={code === locale ? 'true' : undefined}
          >
            <span>{localeDisplayLabel(code, locale)}</span>
            <span className="text-xs text-muted-foreground">{LOCALE_SHORT[code]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
