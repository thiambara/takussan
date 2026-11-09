import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { EcranDuCompte } from '@/components/navigation-publique/EcranDuCompte';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

/**
 * Personnel et sans contenu à référencer : jamais indexé. Le titre est celui de l'anonyme — le
 * serveur du groupe public ne lit pas la session pour le choisir.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('navigationPublique.compte');
  return { title: t('metaTitre'), robots: { index: false, follow: false } };
}

/**
 * TCK-2493 (ADR-0091 §3) — la case 5 de la barre d'onglets publique : « Compte » pour l'anonyme,
 * « Moi » pour le connecté (`EcranDuCompte` choisit sur la session du client).
 */
export default function PageCompte() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <NavbarSpacer />
      <main id={CONTENU_PRINCIPAL_ID} tabIndex={-1} className="flex-1 focus:outline-none">
        <EcranDuCompte />
      </main>
      <Footer />
    </div>
  );
}
