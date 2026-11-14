'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { usePaymentsHistory } from '@/lib/queries/payments';

import { ONGLETS_DE_PAGE } from '@/components/console/PageHeader';
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
    // TCK-2804 — onglets de page (`ONGLETS_DE_PAGE`) : au téléphone, ils commencent sous l'en-tête et y collent
    // (règle du gabarit `PageHeader`) ; la rangée bord à bord porte le fond plein qui couvre ce qui défile dessous.
    <nav
      aria-label={aria}
      data-slot="onglets-des-rapports"
      {...ONGLETS_DE_PAGE}
      className="-mx-4 flex gap-5 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] max-md:bg-background lg:mx-0 lg:gap-6 lg:px-0"
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
            {/* TCK-2801 — la pastille vit DANS le lien de l'onglet Impayés : elle n'existe, et ne lit l'API, que si
                la persona ouvre cet onglet, par la même garde que lui (`ongletsDesRapports`). */}
            {id === 'impayes' ? <PastilleDesImpayes /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * TCK-2801 (fiche TCK-2628, O3) — la pastille « 16 » de l'onglet Impayés (maquette `OngletsSoulignes`, `compte`) :
 * le compte des échéances impayées par LA règle de l'onglet (`GET /api/payments/history`, `days_late_min=1`,
 * `meta.total` d'une page d'une ligne) — celui que l'onglet dit dans « Tous ». Lue dans le navigateur, jamais
 * par le layout, qui n'a pas de `<Suspense>` : une lecture lente ne retient pas la page, une lecture en échec ne
 * pose aucune pastille (jamais « 0 » pour un compte absent). Aucune échéance : rien à signaler.
 */
function PastilleDesImpayes() {
  const t = useTranslations('rapports');
  const f = useFormatteurs();
  const lecture = usePaymentsHistory({ days_late_min: 1, sort: '-days_late', page: 1, per_page: 1 });
  const n = lecture.isError ? undefined : lecture.data?.meta?.total;
  if (typeof n !== 'number' || n <= 0) return null;
  return (
    <>
      <span aria-hidden="true" data-slot="pastille-d-onglet" className="ml-1.5 text-xs font-medium tabular-nums text-muted-foreground">
        {f.nombre(n)}
      </span>
      <span className="sr-only">{t('impayesCompte', { n })}</span>
    </>
  );
}
