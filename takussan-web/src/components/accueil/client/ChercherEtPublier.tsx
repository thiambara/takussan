'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useSavedSearchesQuery } from '@/lib/queries/saved-searches';
import { cn } from '@/lib/utils';

/**
 * TCK-2853 (maquette `app-accueil` a, écran « Client ») — « Chercher un bien » : la recherche publique
 * selon l'intention et la ville du profil (`lienDeLaRecherche`). Au téléphone, bouton contour pleine
 * largeur sous « Vos recherches » ; au bureau, dans la tête de page (`pleineLargeur={false}`).
 */
export function ChercherUnBien({ href, pleineLargeur = true, className }: { readonly href: string; readonly pleineLargeur?: boolean; readonly className?: string }) {
  const t = useTranslations('accueil.client');
  return (
    <Link href={href} className={cn(pleineLargeur ? buttonVariants({ variant: 'outline', size: 'lg' }) : buttonVariants({ variant: 'outline' }), pleineLargeur && 'flex w-full', className)} data-slot="chercher-un-bien">
      <Search className="size-4" aria-hidden="true" />
      {t('chercher')}
    </Link>
  );
}

/**
 * « Vous avez un bien à louer ? Publiez-le en quelques minutes. » — l'entrée de publication existante,
 * `/publish`, qui résout seule la suite (connexion, assistant, TCK-254) : le lien du site public.
 */
export function PublierUnBien({ className }: { readonly className?: string }) {
  const t = useTranslations('accueil.client.publier');
  return (
    <Link
      href="/publish"
      className={cn('flex min-h-11 items-center gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring', className)}
      data-slot="publier-un-bien"
    >
      <span className="min-w-0 flex-1">
        <span className="font-medium text-foreground">{t('question')}</span> <span className="text-muted-foreground">{t('suite')}</span>
      </span>
      <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/**
 * L'invitation à chercher (quatre biens de la ville du profil, TCK-595) n'est pas dessinée par la
 * maquette, qui montre un client AVEC une recherche sauvegardée. Elle reste pour le client qui n'en a
 * aucune, à la place de « Vos recherches » : rendue une fois la liste lue et vide (même requête, même
 * cache que le bloc).
 */
export function SiAucuneRecherche({ children }: { readonly children: ReactNode }) {
  const { token } = useAuth();
  const lues = useSavedSearchesQuery({ enabled: !!token });
  if (!lues.isSuccess || (lues.data?.data ?? []).length > 0) return null;
  return <>{children}</>;
}
