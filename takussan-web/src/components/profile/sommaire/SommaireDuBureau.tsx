'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2, UserRound } from 'lucide-react';

import {
  HREF_DE_LA_RANGEE,
  CHEMIN_DU_SOMMAIRE,
  HREF_SUPPRESSION,
  rangeeDuChemin,
  type IdDeRangee,
} from '@/lib/profil/sommaire';
import { cn } from '@/lib/utils';
import { ICONE_DE_LA_RANGEE } from './icones';
import { BoutonDeDeconnexion, PointARegler } from './pieces';

interface SommaireDuBureauProps {
  readonly rangees: readonly IdDeRangee[];
  /** Les rangées qui portent une chose à régler. Un tableau : la prop traverse la frontière client. */
  readonly points: readonly IdDeRangee[];
}

/** Sous `xl`, la rangée d'une ligne ne se resserre pas : elle défile dans son cadre (ADR-0106 § 4). */
const RANGEE = 'flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm max-xl:flex-none max-xl:whitespace-nowrap';
const ACTIVE = 'bg-foreground/7 font-medium';
const INACTIVE = 'text-foreground/85 hover:bg-foreground/4';

function cheminNu(pathname: string | null): string {
  const nu = (pathname ?? '').split(/[?#]/)[0] ?? '';
  return nu.length > 1 && nu.endsWith('/') ? nu.slice(0, -1) : nu;
}

/**
 * TCK-2635 — le sommaire du profil au bureau (maquette `app-profil` a, `PageProfilBureau`) : collant à
 * gauche de la section dès `xl`, 260 px ; de `md` à `xl`, une rangée de liens d'une ligne au-dessus du
 * contenu, qui défile dans son cadre. Au téléphone, il n'existe pas : le sommaire EST la page
 * `/app/profile`, et chaque section a sa page de détail.
 */
export function SommaireDuBureau({ rangees, points }: SommaireDuBureauProps) {
  const t = useTranslations('profile.sommaire');
  const chemin = cheminNu(usePathname());
  const active = rangeeDuChemin(chemin);
  const surVue = chemin === CHEMIN_DU_SOMMAIRE;
  const surSuppression = chemin === HREF_SUPPRESSION;
  const aPoint = new Set(points);

  return (
    <nav
      aria-label={t('navLabel')}
      data-slot="sommaire-du-profil"
      className="w-full flex-none max-md:hidden max-xl:flex max-xl:gap-1 max-xl:overflow-x-auto max-xl:border-b max-xl:border-border max-xl:pb-2 xl:sticky xl:top-6 xl:w-[16.25rem]"
    >
      <Link href={CHEMIN_DU_SOMMAIRE} aria-current={surVue ? 'page' : undefined} className={cn(RANGEE, surVue ? ACTIVE : INACTIVE)}>
        <UserRound
          className={cn('size-icone flex-none', surVue ? 'text-primary' : 'text-muted-foreground')}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        {t('vueDEnsemble')}
      </Link>
      {rangees.map((id) => {
        const Icone = ICONE_DE_LA_RANGEE[id];
        const courante = id === active;
        return (
          <Link
            key={id}
            href={HREF_DE_LA_RANGEE[id].href}
            aria-current={courante ? 'page' : undefined}
            className={cn(RANGEE, courante ? ACTIVE : INACTIVE)}
          >
            <Icone
              className={cn('size-icone flex-none', courante ? 'text-primary' : 'text-muted-foreground')}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate max-xl:flex-none">{t(`rangees.${id}`)}</span>
            {aPoint.has(id) ? <PointARegler /> : null}
          </Link>
        );
      })}
      <Link
        href={HREF_SUPPRESSION}
        aria-current={surSuppression ? 'page' : undefined}
        className={cn(
          RANGEE,
          'mt-3 border-t border-border pt-3 text-destructive max-xl:ml-2 max-xl:mt-0 max-xl:rounded-none max-xl:border-l max-xl:border-t-0 max-xl:pl-4 max-xl:pt-0',
          surSuppression && 'font-medium',
        )}
      >
        <Trash2 className="size-icone flex-none" strokeWidth={1.5} aria-hidden="true" />
        {t('supprimer')}
      </Link>
      <BoutonDeDeconnexion className={cn(RANGEE, INACTIVE, 'w-full text-left max-xl:w-auto')} />
    </nav>
  );
}
