'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

/**
 * TCK-2602 — un bien que l'écran « en ligne » ne sert pas (agence `standard`, brouillon…) mène à sa
 * fiche. Le renvoi se fait CÔTÉ CLIENT, et non par `redirect()` dans la page : sous le `loading.tsx`
 * du segment, un `redirect()` de page répond 200 puis navigue, et la garde `etats-de-route` (TCK-426)
 * refuse toute page qui refuse depuis sous une frontière. Ce n'est pas un refus d'accès — l'API l'est,
 * et la lecture du layout a déjà rendu 404 ou refusé —, seulement le chemin d'un bien que l'écran ne
 * sert pas. Le lien reste visible tant que la navigation n'a pas eu lieu (sans JavaScript, il suffit).
 */
export function RenvoiVersLaFiche({ href }: { readonly href: string }) {
  const router = useRouter();
  const t = useTranslations('property.wizard.enLigne');
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return (
    <p className="p-6 text-sm text-muted-foreground">
      <NextLink href={href} className="font-medium text-foreground underline underline-offset-4">
        {t('versLaFiche')}
      </NextLink>
    </p>
  );
}
