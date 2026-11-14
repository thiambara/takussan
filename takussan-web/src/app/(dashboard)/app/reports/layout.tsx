import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/console';
import { OngletsDesRapports } from '@/components/rapports/OngletsDesRapports';
import { DescriptionDesRapports, ExporterLeRapport } from '@/components/rapports/TeteDesRapports';
import { IntlProvider } from '@/i18n/IntlProvider';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { messagesPour } from '@/i18n/messages';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { ongletsDesRapports } from '@/lib/navigation/rapports';
import type { ContexteServeurDesRapports } from '@/lib/rapports/contexte-serveur';
import { garderLesRapports } from '@/lib/rapports/gardes-serveur';
import { bornesLisibles, moisCourant } from '@/lib/rapports/periode';
import { getToken } from '@/lib/session';

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
  const [t, locale, nomDeLAgence] = await Promise.all([getTranslations('rapports'), localeDeLaRequete(), lireLeNomDeLAgence(contexte)]);
  const ids = ongletsDesRapports(contexte);
  const onglets = ids.map((id) => ({ id, libelle: t(`onglets.${id}`) }));
  const mois = moisCourant();
  const periode = t('descriptionPeriode', bornesLisibles(mois.debut, mois.fin, locale));
  const personnel = contexte.persona === 'admin-agence' || contexte.persona === 'plateforme';
  return (
    <IntlProvider messages={await messagesPour('(dashboard)/app/reports')}>
      <div className="space-y-6">
        {/* TCK-2801 (fiche TCK-2628, O2) — au bureau, la description et « Exporter » (maquette `TeteRapports`).
            Sous `md`, l'en-tête de page n'a que le H1, masqué au profit de l'en-tête de la coque (TCK-2617) :
            l'en-tête entier s'y masque, pour que la description et l'action n'ajoutent aucune hauteur au-dessus
            des onglets ; la ligne de période reste dans la page, comme la maquette du téléphone. */}
        <PageHeader
          className="max-md:[&>header]:hidden"
          title={t('titre')}
          description={
            <DescriptionDesRapports
              nom={(personnel ? nomDeLAgence : null) ?? contexte.user.full_name}
              nomDeLAgence={contexte.persona === 'agent' ? nomDeLAgence : null}
              periode={periode}
            />
          }
          actions={ids.includes('exports') ? <ExporterLeRapport libelle={t('exporter')} /> : undefined}
          dessous={
            <OngletsDesRapports
              onglets={onglets}
              aria={t('ongletsAria')}
              transmetLaPortee={contexte.persona === 'agent'}
            />
          }
        />
        {children}
      </div>
    </IntlProvider>
  );
}

/**
 * TCK-2801 — le nom de l'agence de la description, LU comme la coque le lit (`resolveAgencyOrNull` en usage
 * d'affichage, mêmes arguments que `lireLeContexteDesRapports` : la promesse `cache()`ée du rendu). Il ne fait
 * que peindre : sans lui, la description dit le nom de la personne.
 */
async function lireLeNomDeLAgence({ user }: ContexteServeurDesRapports): Promise<string | null> {
  if (typeof user.agency_id !== 'number') return null;
  const token = await getToken();
  const agence = token ? await resolveAgencyOrNull(token, user.agency_id, 'reports (persona)') : null;
  return agence?.name ?? null;
}
