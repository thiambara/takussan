'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Download, Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { hrefDeLOnglet, porteeTransmise } from '@/lib/navigation/rapports';
import { periodeTransmise } from '@/lib/rapports/periode';
import { cn } from '@/lib/utils';

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
  periodeMoisDernier,
  periodeDouzeMois,
}: {
  readonly nom: string;
  /** L'agent seul : le nom à dire sous la portée « Agence ». */
  readonly nomDeLAgence?: string | null;
  readonly periode: string;
  /**
   * TCK-2791 — la période dite sous « Mois dernier » (`?period=last_month`), sur la vue d'ensemble seule : les
   * autres onglets lisent le mois en cours.
   */
  readonly periodeMoisDernier?: string;
  /** TCK-2867 — la période dite sous « 12 mois » (`?period=last_12_months`), sur la vue d'ensemble seule. */
  readonly periodeDouzeMois?: string;
}) {
  const t = useTranslations('rapports');
  const parametres = useSearchParams();
  const chemin = usePathname();
  const agence = nomDeLAgence && porteeTransmise(parametres?.get('scope')) === 'agency';
  const choisie = chemin === hrefDeLOnglet('ensemble') ? periodeTransmise(parametres?.get('period')) : 'current_month';
  const dite = (choisie === 'last_month' && periodeMoisDernier) || (choisie === 'last_12_months' && periodeDouzeMois) || periode;
  return <>{t('description', { nom: agence ? nomDeLAgence : nom, periode: dite })}</>;
}

/**
 * TCK-2867 (maquette e0, téléphone) — « ⋯ » de l'en-tête du téléphone, avec « Exporter » : l'action de la tête du
 * bureau, que l'en-tête de page masqué sous `md` ne montre pas. Déclarée à la coque (`DeclarerEnTete`, forme
 * `racine` : un bouton de 40 px) partout où le bureau rend « Exporter » — jamais sur Alertes, qui déclare
 * « + Nouvelle alerte » à la même place (`AlertList`).
 */
export function PlusDActionsDesRapports({ exporter }: { readonly exporter: string | null }) {
  const chemin = usePathname();
  const t = useTranslations('rapports');
  if (!exporter || chemin === hrefDeLOnglet('alertes')) return null;
  return (
    <DeclarerEnTete
      action={
        <DropdownMenu>
          <DropdownMenuTrigger
            data-slot="plus-d-actions-des-rapports"
            aria-label={t('plusDActions')}
            className={cn(
              'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-encre-douce outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring',
            )}
          >
            <Ellipsis className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<Link href={hrefDeLOnglet('exports')} />}>
              <Download aria-hidden="true" />
              {exporter}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
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
