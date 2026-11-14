import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/console';
import { OngletsDesRapports } from '@/components/rapports/OngletsDesRapports';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { ongletsDesRapports } from '@/lib/navigation/rapports';
import { garderLesRapports } from '@/lib/rapports/gardes-serveur';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rapports');
  return { title: t('titre') };
}

/**
 * TCK-2628 (ADR-0096 § 3) — « Rapports » : une page, des onglets, une URL par onglet. Ce layout est la
 * frontière de dictionnaire de la section (ADR-0022) et porte l'en-tête commun : le titre et la barre
 * d'onglets de la persona (`ongletsDesRapports` : la table, le masque des modules, la page d'origine
 * d'Équipe et d'Impayés). Une persona sans « Rapports » (locataire, client, prestataire) va à `/app`.
 *
 * ⚠ Aucun `loading.tsx` ni `<Suspense>` à ce niveau : chaque onglet décide de son accès dans SON
 * layout, et un repli au-dessus rendrait ses refus en 200 (TCK-426, `etats-de-route.test.ts`). Les
 * squelettes vivent à côté de chaque page, sous sa garde.
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  const contexte = await garderLesRapports();
  const t = await getTranslations('rapports');
  const onglets = ongletsDesRapports(contexte).map((id) => ({ id, libelle: t(`onglets.${id}`) }));
  return (
    <IntlProvider messages={await messagesPour('(dashboard)/app/reports')}>
      <div className="space-y-6">
        <PageHeader
          title={t('titre')}
          dessous={
            <OngletsDesRapports onglets={onglets} aria={t('ongletsAria')} transmetLaPortee={contexte.persona === 'agent'} />
          }
        />
        {children}
      </div>
    </IntlProvider>
  );
}
