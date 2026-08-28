'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Globe } from 'lucide-react';
import { setLocaleAction } from '@/app/actions/locale';
import { cheminLocalise, estCheminLocalisable } from '@/i18n/routing';
import {
  LOCALES,
  LOCALE_SHORT,
  localeDisplayLabel,
  type Locale,
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
 * Le commutateur de langue — [ADR-0026](../../../docs/adr/0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md) §5.
 *
 * Il fait DEUX choses, et l'ordre compte peu mais l'union est nécessaire :
 *
 * 1. **Il navigue.** Sur une page publique, changer de langue change l'URL
 *    (`/fr/properties/x` → `/en/properties/x`). C'est ce qui rend le choix partageable, et ce qui
 *    fait que le retour arrière du navigateur ramène à la langue précédente : un changement de
 *    langue est une navigation, pas un réglage invisible.
 * 2. **Il écrit le cookie** (`setLocaleAction`), pour que les surfaces qui ne portent pas la langue
 *    dans leur URL — la console, `/auth`, `/onboarding` — et les entrées ultérieures sans préfixe
 *    suivent le même choix.
 *
 * ⚠ Hors de la surface publique, `usePathname()` rend un chemin non localisable (`/app/overview`) :
 * il n'y a alors rien à naviguer, et seul le cookie change. Ne pas « corriger » ce cas en préfixant
 * quand même — la console n'a pas de route `[locale]`, ce serait un 404.
 */
export function LanguageSwitcher({ className, variant = 'compact' }: LanguageSwitcherProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('common.languageSwitcher');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  const handleSelect = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleAction(next);
      if (estCheminLocalisable(pathname)) {
        // ⚠ `window.location.search` et non `useSearchParams()` : ce hook force la page qui monte
        // ce composant sous une frontière de suspension au build (« useSearchParams() should be
        // wrapped in a suspense boundary »), et le commutateur est monté dans la Navbar et le
        // pied de page — donc sur toute la surface publique. Ici la lecture n'a lieu que dans le
        // gestionnaire de clic, où le navigateur existe par construction.
        const requete = window.location.search;
        router.push(cheminLocalise(pathname, next) + requete);
      }
    });
  };

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
