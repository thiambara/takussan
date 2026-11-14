'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { hrefDeLOnglet, porteeTransmise } from '@/lib/navigation/rapports';

/**
 * TCK-2801 (fiche TCK-2628, O2) — la description de la tête de « Rapports » : « <nom> · du 1 au 30 novembre
 * 2026 » (maquette `TeteRapports`). Le nom est l'agence de l'admin, la personne de l'agent, du bailleur et de
 * l'hôte ; l'agent en portée « Agence » lit le nom de l'agence. La portée se lit dans l'adresse, côté
 * navigateur : le layout qui rend cette tête ne se re-rend pas quand seule la requête change.
 */
export function DescriptionDesRapports({
  nom,
  nomDeLAgence,
  periode,
}: {
  readonly nom: string;
  /** L'agent seul : le nom à dire sous la portée « Agence ». */
  readonly nomDeLAgence?: string | null;
  readonly periode: string;
}) {
  const t = useTranslations('rapports');
  const parametres = useSearchParams();
  const agence = nomDeLAgence && porteeTransmise(parametres?.get('scope')) === 'agency';
  return <>{t('description', { nom: agence ? nomDeLAgence : nom, periode })}</>;
}

/** TCK-2801 — « Exporter » de la tête : l'onglet Exports, où sont les exports prêts et l'export personnalisé. */
export function ExporterLeRapport({ libelle }: { readonly libelle: string }) {
  return (
    <Link href={hrefDeLOnglet('exports')} className={buttonVariants({ variant: 'outline' })}>
      <Download aria-hidden="true" />
      {libelle}
    </Link>
  );
}
