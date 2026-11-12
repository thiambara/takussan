import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronRight, Trash2 } from 'lucide-react';

import { HREF_DE_LA_RANGEE, HREF_SUPPRESSION, type IdDeRangee } from '@/lib/profil/sommaire';
import { ICONE_DE_LA_RANGEE } from './icones';
import { BoutonDeDeconnexion, PointARegler } from './pieces';

interface SommaireDuTelephoneProps {
  readonly rangees: readonly IdDeRangee[];
  readonly points: ReadonlySet<IdDeRangee>;
  readonly details: Readonly<Record<IdDeRangee, string>>;
}

/**
 * TCK-2635 — le sommaire au téléphone (maquette `ListeSommaire` et `PiedCompte`) : une rangée de 56 px
 * par section, bord à bord, qui ouvre sa page ; un point sur ce qui demande une action ; puis, en
 * dernier et en rouge, « Supprimer mon compte », et « Déconnexion ». Dès `md`, le sommaire du bureau
 * (`SommaireDuBureau`) prend le relais : ce bloc n'y est pas rendu.
 */
export async function SommaireDuTelephone({ rangees, points, details }: SommaireDuTelephoneProps) {
  const t = await getTranslations('profile.sommaire');
  return (
    <div data-slot="sommaire-du-telephone" className="md:hidden">
      <ul className="divide-y divide-border/70 border-y border-border/70">
        {rangees.map((id) => {
          const Icone = ICONE_DE_LA_RANGEE[id];
          return (
            <li key={id}>
              <Link href={HREF_DE_LA_RANGEE[id].href} className="flex min-h-14 items-center gap-3.5 px-4 py-2">
                <Icone className="size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block text-corps font-medium">{t(`rangees.${id}`)}</span>
                  <span className="block truncate text-ui text-muted-foreground">{details[id]}</span>
                </span>
                {points.has(id) ? <PointARegler /> : null}
                <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="px-4 pb-8 pt-2">
        <Link
          href={HREF_SUPPRESSION}
          data-slot="supprimer-mon-compte"
          className="flex min-h-12 items-center gap-3.5 border-b border-border/70 text-corps font-medium text-destructive"
        >
          <Trash2 className="size-5" strokeWidth={1.5} aria-hidden="true" />
          {t('supprimer')}
        </Link>
        <BoutonDeDeconnexion className="flex min-h-12 w-full items-center gap-3.5 text-left text-corps font-medium" />
      </div>
    </div>
  );
}
