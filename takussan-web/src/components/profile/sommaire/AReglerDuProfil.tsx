import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BadgeCheck, Phone, ShieldCheck, type LucideIcon } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import type { ARegler, IdARegler } from '@/lib/profil/sommaire';
import { cn } from '@/lib/utils';

const ICONE: Readonly<Record<IdARegler, LucideIcon>> = {
  telephone: Phone,
  'double-authentification': ShieldCheck,
  fiche: BadgeCheck,
};

/**
 * TCK-2635 — « À régler » : ce qui demande une action, avec son geste (maquette a-0). Chaque geste
 * OUVRE la section qui le porte — « Vérifier » mène à la vérification du téléphone, il n'envoie aucun
 * code par lui-même.
 *
 * Au téléphone, un encart par chose à régler, sous le titre (décision 8 a : AC1 en demande deux au-dessus
 * du pli, la maquette n'en dessine qu'un) ; au bureau, une carte de rangées. Rien à régler : rien.
 */
/** Le premier geste est plein, les suivants en contour (maquette « À régler »). */
function varianteDuGeste(rang: number): 'default' | 'outline' {
  return rang === 0 ? 'default' : 'outline';
}

export async function AReglerDuProfil({ liste }: { readonly liste: readonly ARegler[] }) {
  if (liste.length === 0) return null;
  const t = await getTranslations('profile.sommaire.aRegler');
  return (
    <section aria-labelledby="a-regler-du-profil" data-slot="a-regler-du-profil">
      <h2 id="a-regler-du-profil" className="mb-2 text-corps font-semibold">
        {t('titre')}
      </h2>

      <ul className="grid gap-2 md:hidden">
        {liste.map(({ id, href }, i) => {
          const Icone = ICONE[id];
          return (
            <li key={id} className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/6 p-3.5">
              <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Icone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p className="min-w-0 flex-1 text-sm leading-snug">{t(`${id}.titre`)}</p>
              <Link href={href} className={buttonVariants({ size: 'sm', variant: varianteDuGeste(i) })}>
                {t(`${id}.action`)}
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card max-md:hidden">
        {liste.map(({ id, href }, i) => {
          const Icone = ICONE[id];
          return (
            <li key={id} className="flex items-center gap-3 px-4 py-3">
              <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-primary/10 text-primary-deep">
                <Icone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t(`${id}.titre`)}</p>
                <p className="text-ui text-muted-foreground">{t(`${id}.detail`)}</p>
              </div>
              <Link href={href} className={cn(buttonVariants({ size: 'sm', variant: varianteDuGeste(i) }), 'flex-none')}>
                {t(`${id}.action`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
