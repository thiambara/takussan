'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * TCK-2508 — pour l'anonyme qui a des favoris : une CARTE, pas une barrière. Ses favoris ne vivent
 * que dans ce navigateur ; avec son numéro, ils passent dans un compte (versés à la connexion par
 * `AuthContext`, comme aujourd'hui) et le suivent partout. La connexion ramène ici.
 */
export function CarteDeCompte() {
  const t = useTranslations('favorites.suivi.compte');
  const pathname = usePathname();
  const qs = useSearchParams().toString();
  const retour = qs ? `${pathname}?${qs}` : pathname;

  return (
    <section
      aria-labelledby="carte-de-compte-titre"
      data-testid="carte-de-compte"
      className="rounded-2xl bg-secondary p-4 lg:flex lg:items-center lg:gap-6 lg:p-5"
    >
      <div className="min-w-0 flex-1">
        <h2 id="carte-de-compte-titre" className="text-titre-court font-semibold leading-snug">
          {t('titre')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('texte')}</p>
      </div>
      <LienLocalise
        href={`/auth/login?redirect=${encodeURIComponent(retour)}`}
        className={cn(buttonVariants({ size: 'lg' }), 'mt-3 h-11 w-full rounded-xl text-corps font-semibold lg:mt-0 lg:w-auto lg:px-5')}
      >
        {t('cta')}
      </LienLocalise>
    </section>
  );
}
