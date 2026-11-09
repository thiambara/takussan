import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { getLocale, getTranslations } from 'next-intl/server';
import { Compass, SearchX } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { segmentDeSlug } from '@/lib/slug-de-bien';
import { cn } from '@/lib/utils';
import type { PropertyDetail } from '@/types/property';
import { BookingTunnel } from '@/components/bookings/BookingTunnel';
import { estSejourCourt, lireSejourDemande } from '@/components/bookings/tunnel-de-reservation';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

/**
 * La coque du site public autour du tunnel. La page n'en avait aucune : ni marque, ni
 * navigation, ni pied — une impasse dont on ne sortait que par le bouton « Retour » du
 * navigateur (revue design du 2026-09-16).
 *
 * TCK-2510 — `plein` : sous `lg`, le tunnel tient TOUT l'écran (son en-tête avec « Fermer » ou
 * « Retour », sa barre basse) — ni barre du site, ni pied, ni barre d'onglets (ADR-0091 § 4 : une
 * seule couche d'action en bas). En bureau, la coque reste.
 */
function Coque({ children, plein = false }: { readonly children: ReactNode; readonly plein?: boolean }) {
  const surBureau = plein ? 'hidden lg:block' : undefined;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className={surBureau}>
        {/* TCK-2568 — `/bookings` n'a pas la barre du site au téléphone (le tunnel porte son en-tête) ;
            hors tunnel (aucun bien, bien introuvable, bien au mois ou à vendre), la page la garde :
            elle n'a pas d'autre issue. */}
        <Navbar auTelephone={plein ? undefined : 'barre-du-site'} />
        <NavbarSpacer auTelephone={plein ? undefined : 'barre-du-site'} />
      </div>
      <main id={CONTENU_PRINCIPAL_ID} tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <div className={surBureau}>
        <Footer />
      </div>
    </div>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bookings.public');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: false },
  };
}

/**
 * Public booking tunnel entry, accessed via
 * `/bookings?property=<slug>[&debut=&fin=&personnes=]` from the property detail page (« Réserver »
 * d'un séjour court, TCK-2510).
 *
 * The server component fetches the property once for SEO/performance, the
 * client tunnel below handles the interactive flow (TCK-043).
 */
export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // `?property=a&property=b` arrive en tableau : ce n'est pas un slug.
  const slug = typeof params.property === 'string' ? params.property : undefined;
  const t = await getTranslations('bookings.public');

  if (!slug) {
    return (
      <Coque>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <EmptyState
            icon={<Compass className="size-8" aria-hidden="true" />}
            title={t('no_property_title')}
            description={t('no_property_description')}
            action={
              <LienLocalise
                href="/properties"
                className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-4')}
              >
                {t('browse_cta')}
              </LienLocalise>
            }
          />
        </div>
      </Coque>
    );
  }

  let property: PropertyDetail | null = null;
  // Après verif-598 (m2) : `encodeURIComponent` laisse `.` et `..`, que `fetch` résout —
  // `?property=.` appelait la liste du catalogue. Hors forme d'un slug de bien : introuvable,
  // sans appel.
  const segment = segmentDeSlug(slug);
  if (segment !== null) {
    try {
      // TCK-598 (AC20) — le slug lu dans l'URL est UN segment de chemin, encodé comme tel. Brut,
      // `?property=..%2Fproperties%3Fper_page%3D100000` faisait appeler
      // `/public/properties/../properties?per_page=100000` — la liste du catalogue, normalisée par
      // `fetch`, au plafond que le visiteur choisissait. L'appel est rendu POUR le visiteur : il
      // transmet son IP (comportement par défaut d'`apiFetch`).
      const res = await apiFetch<{ data: PropertyDetail }>(
        `/public/properties/${segment}`,
        undefined,
        { locale: await getLocale() },
      );
      property = res.data;
    } catch {
      property = null;
    }
  }

  if (!property) {
    return (
      <Coque>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <EmptyState
            icon={<SearchX className="size-8" aria-hidden="true" />}
            title={t('not_found_title')}
            description={t('not_found_description')}
            action={
              <LienLocalise
                href="/properties"
                className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-4')}
              >
                {t('browse_cta')}
              </LienLocalise>
            }
          />
        </div>
      </Coque>
    );
  }

  // TCK-2510 — les dates et les personnes rapportées par l'URL (retour de connexion, rechargement).
  return (
    // Plein écran pour le seul tunnel : l'état « au mois » ou « vente » n'a ni en-tête ni barre basse
    // à lui, et sans la barre du site il ne laisserait aucune issue que son bouton.
    <Coque plein={estSejourCourt(property)}>
      <BookingTunnel property={property} sejourInitial={lireSejourDemande(params)} />
    </Coque>
  );
}
