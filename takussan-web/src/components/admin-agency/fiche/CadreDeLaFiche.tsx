'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/console';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { completudeDeLaFiche, etatDesSections, sectionsMontrees, verificationAJour } from '@/lib/agence/fiche';
import { fetchAgencyKyc } from '@/lib/queries/kyc';
import { agencyKycKey } from '@/lib/queries/agency-queues';
import type { Agency } from '@/types/agency';

import { AdresseEnLigne } from './AdresseEnLigne';
import { JaugeDuBureau, lienExterne, NavigationDesSections, titreDeLaSection } from './FicheDeLAgence';
import { TitreDeSection } from './pieces';

interface CadreDeLaFicheProps {
  readonly agency: Agency;
  /** `peutEcrireLaVitrine` : la section « Fiche publique » n'apparaît qu'à qui l'écrit. */
  readonly vitrine: boolean;
  /** L'origine du site public (`origineSite()`), lue côté serveur. */
  readonly origineSite: string;
  /** Les deux sections de la fiche qui sont des pages. */
  readonly section: 'verification' | 'offre';
  /** Le titre et le texte de la section, au bureau (le téléphone a le titre dans son en-tête). */
  readonly titre: string;
  readonly texte?: string;
  /**
   * La jauge de complétude au-dessus des sections, au bureau. La maquette ne la pose que sur l'offre
   * d'une agence déjà professionnelle (écran a-8) : ni sur la vérification (a-5), qui est elle-même un
   * des éléments de la jauge, ni sur le passage en pro de l'hôte (a-9).
   */
  readonly jauge?: boolean;
  readonly children: ReactNode;
}

/**
 * TCK-2671 — le cadre de la fiche de l'agence autour de ses deux sections qui sont des pages
 * (`/app/agency/kyc`, `/app/settings/agency/upgrade`) : au bureau, la tête « Mon agence », la jauge et
 * la navigation des sections, comme `FicheDeLAgence` ; au téléphone, l'écran de la section et sa flèche
 * vers le sommaire.
 *
 * Mêmes pièces que la fiche (jauge, navigation, titres), lues de la même agence et du même dossier de
 * vérification (même clé de requête : la page Vérification et la jauge partagent la lecture). Un lien
 * vers une section du formulaire est une navigation vers `/app/agency?section=…` : il n'y a pas de
 * formulaire à garder monté ici.
 */
export function CadreDeLaFiche({ agency, vitrine, origineSite, section, titre, texte, jauge = false, children }: CadreDeLaFicheProps) {
  const tFiche = useTranslations('admin.agencyConfig.fiche');
  const individuelle = agency.kind === 'individual';
  const montrees = sectionsMontrees({ individuelle, vitrine });

  const kyc = useQuery({
    queryKey: agencyKycKey(agency.id),
    queryFn: () => fetchAgencyKyc(agency.id),
    staleTime: 60_000,
    retry: false,
  });
  const dossier = kyc.data?.data ?? null;
  const verification = kyc.isError ? null : dossier ? verificationAJour(dossier) : kyc.isSuccess ? false : null;
  const completude = kyc.isPending ? null : completudeDeLaFiche(agency, verification);
  const etats = completude ? etatDesSections(completude, [], dossier) : null;

  const adressePublique = `${origineSite.replace(/^https?:\/\//, '')}/agencies/${agency.slug}`;
  const cheminPublic = `/agencies/${agency.slug}`;
  const titreDeSection = (s: Parameters<typeof lienExterne>[0]) => titreDeLaSection(tFiche, s, individuelle);

  return (
    <PagePleineLargeur>
      <DeclarerEnTete titre={titreDeSection(section)} forme="detail" repli="/app/agency" />

      <div className="max-md:hidden">
        <PageHeader
          title={tFiche('titre')}
          description={<AdresseEnLigne adresse={adressePublique} />}
          actions={
            <a href={cheminPublic} target="_blank" rel="noopener" className={buttonVariants({ variant: 'outline' })}>
              <ExternalLink aria-hidden="true" />
              {tFiche('voirMaFichePublique')}
            </a>
          }
        />
      </div>

      <div className="mt-6 space-y-6 max-md:mt-0 max-md:px-4 max-md:py-4">
        {jauge ? <JaugeDuBureau completude={completude} surLien={null} /> : null}
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-8">
          <NavigationDesSections montrees={montrees} active={section} etats={etats} titre={titreDeSection} lien={lienExterne} surLien={null} />
          <div className="min-w-0 flex-1" data-slot="section-de-la-fiche">
            <TitreDeSection id={`titre-section-${section}`} titre={titre} texte={texte} texteAuBureauSeulement />
            {children}
          </div>
        </div>
      </div>
    </PagePleineLargeur>
  );
}
