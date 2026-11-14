import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PAGE_DES_INDICATEURS, indicateursOuverts } from '@/lib/navigation/rapports';
import { lireLeContexteDesRapports } from '@/lib/rapports/contexte-serveur';

/**
 * TCK-2628 (décision 3) — « Personnaliser les chiffres » : le chemin vers les indicateurs, qui ont quitté
 * le menu. Rendu à qui les ouvre (`indicateursOuverts` : l'admin et l'hôte, masqués par `analytics`).
 */
export async function LienDesIndicateurs() {
  const [contexte, t] = await Promise.all([lireLeContexteDesRapports(), getTranslations('rapports')]);
  if (!indicateursOuverts(contexte)) return null;
  return (
    <Link
      href={PAGE_DES_INDICATEURS}
      className="inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
    >
      {t('personnaliser')}
    </Link>
  );
}
