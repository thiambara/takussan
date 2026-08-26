import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { cn } from '@/lib/utils';

/**
 * La navigation par onglets de `/admin/settings*`.
 *
 * Ce sont des CHANGEMENTS DE ROUTE, pas des panneaux : `/admin/settings` et
 * `/admin/settings/integrations` sont deux pages serveur qui chargent des données différentes.
 * Ils restent donc des `<Link>` — un `<Tabs>` client les transformerait en onglets qui rechargent
 * la page, c'est-à-dire en liens déguisés.
 *
 * Ce qu'ils ne sont plus, c'est recopiés. Les deux pages portaient le même bloc de six lignes,
 * l'une avec la première branche active et l'autre avec la seconde — donc **deux endroits où
 * ajouter un troisième onglet, et un seul qui aurait été trouvé**.
 *
 * Composant SERVEUR (`getTranslations`) : les deux pages qui le montent le sont aussi, et le
 * rendre client aurait embarqué une frontière pour trois libellés.
 */
export async function SettingsTabs({ active }: { readonly active: 'general' | 'integrations' }) {
  const t = await getTranslations('admin.pages.settings');

  const onglets = [
    { cle: 'general', href: '/admin/settings', label: t('tabGeneral') },
    { cle: 'integrations', href: '/admin/settings/integrations', label: t('tabIntegrations') },
  ] as const;

  return (
    <nav className="flex flex-wrap gap-2" aria-label={t('navAria')}>
      {onglets.map((onglet) => (
        <Link
          key={onglet.cle}
          href={onglet.href}
          // `aria-current="page"` porte l'état actif pour un lecteur d'écran : la couleur seule
          // ne le dit qu'à qui voit.
          aria-current={onglet.cle === active ? 'page' : undefined}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium',
            onglet.cle === active
              ? 'bg-primary text-primary-foreground'
              : 'border border-input text-muted-foreground hover:bg-muted',
          )}
        >
          {onglet.label}
        </Link>
      ))}
    </nav>
  );
}
