'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { hrefDeLOnglet, ongletDeLAdresse, porteeTransmise, type IdOnglet } from '@/lib/navigation/rapports';
import { cn } from '@/lib/utils';

export interface OngletDesRapports {
  readonly id: IdOnglet;
  readonly libelle: string;
}

interface OngletsDesRapportsProps {
  /** Les onglets OUVERTS, dans leur ordre (`ongletsDesRapports`) : un onglet fermé n'est pas rendu. */
  readonly onglets: readonly OngletDesRapports[];
  readonly aria: string;
  /** L'agent : la portée « Agence » de l'adresse suit les onglets qui la lisent (`hrefDeLOnglet`). */
  readonly transmetLaPortee?: boolean;
}

/**
 * TCK-2628 (ADR-0096 § 3) — les onglets de « Rapports » : des LIENS, une URL par onglet (partageable,
 * l'historique les suit), l'onglet de l'adresse marqué `aria-current="page"`. Soulignés comme ceux de la
 * maquette (`OngletsSoulignes`) ; au téléphone, la rangée défile horizontalement et chaque onglet offre
 * 44 px d'appui.
 *
 * La portée se lit dans l'adresse côté navigateur : le layout qui rend cette barre ne se re-rend pas
 * quand seule la requête change (bascule « Moi / Agence »).
 */
export function OngletsDesRapports({ onglets, aria, transmetLaPortee = false }: OngletsDesRapportsProps) {
  const chemin = usePathname();
  const parametres = useSearchParams();
  const actif = ongletDeLAdresse(chemin ?? '');
  const portee = transmetLaPortee ? porteeTransmise(parametres?.get('scope')) : null;

  return (
    <nav
      aria-label={aria}
      data-slot="onglets-des-rapports"
      className="-mx-4 flex gap-5 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] lg:mx-0 lg:gap-6 lg:px-0"
    >
      {onglets.map(({ id, libelle }) => {
        const estActif = id === actif;
        return (
          <Link
            key={id}
            href={hrefDeLOnglet(id, portee)}
            aria-current={estActif ? 'page' : undefined}
            className={cn(
              'relative inline-flex h-11 flex-none items-center whitespace-nowrap rounded-sm text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring lg:h-auto lg:pb-3',
              estActif
                ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {libelle}
          </Link>
        );
      })}
    </nav>
  );
}
