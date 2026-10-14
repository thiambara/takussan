import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { cn } from '@/lib/utils';

/**
 * La navigation par onglets de `/admin/settings*`.
 *
 * Ce sont des CHANGEMENTS DE ROUTE, pas des panneaux : chaque onglet est une page serveur qui
 * charge ses propres données. Ils restent donc des `<Link>` — un `<Tabs>` client les transformerait
 * en onglets qui rechargent la page, c'est-à-dire en liens déguisés.
 *
 * Composant SERVEUR (`getTranslations`) : la page qui le monte l'est aussi, et le rendre client
 * aurait embarqué une frontière pour un libellé.
 *
 * TCK-648 (ADR-0064 §1) — l'onglet « Général » menait à `/admin/settings`, l'éditeur de la table
 * `settings` : une page de la PLATEFORME, partie dans la console (`/super-admin/settings/global`).
 * La page d'intégrations d'une agence n'y mène plus, pour personne — un super-admin trouve les
 * paramètres globaux dans sa console. `canSeeGeneral` (TCK-370), qui retirait cet onglet à tout
 * non-super-admin, n'a donc plus rien à décider : il n'est plus lu. La signature, elle, est gardée
 * telle quelle (`'general'` compris, qui n'allume plus rien) pour que la page qui le monte
 * (`admin/settings/integrations/page.tsx`) et son test compilent sans être touchés ici. Cette page
 * est déplacée par TCK-649, qui retire l'appel — et ce composant d'un seul onglet avec lui.
 */
export async function SettingsTabs({
  active,
}: {
  readonly active: 'general' | 'integrations';
  readonly canSeeGeneral?: boolean;
}) {
  const t = await getTranslations('admin.pages.settings');

  const onglets = [
    { cle: 'integrations', href: '/admin/settings/integrations', label: t('tabIntegrations') },
  ];

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
            // La bordure est posée sur les DEUX états : l'onglet actif, sans elle, mesurait 2 px
            // de moins que ses voisins et la rangée sautait d'un onglet à l'autre.
            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            onglet.cle === active
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input text-muted-foreground hover:bg-muted',
          )}
        >
          {onglet.label}
        </Link>
      ))}
    </nav>
  );
}
