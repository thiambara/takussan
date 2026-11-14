'use client';

import type { ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import type { Locale } from '@/i18n/config';
import { hrefLocalise } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Le point terracotta d'une rangée qui demande une action (maquette `Point`). */
export function PointARegler({ className }: { readonly className?: string }) {
  const t = useTranslations('profile.sommaire');
  return <span role="img" aria-label={t('point')} className={cn('size-2 flex-none rounded-full bg-primary', className)} />;
}

/**
 * « Déconnexion », au pied du sommaire — comme le menu et la feuille du compte (TCK-509, TCK-633) :
 * cookie ET jeton tombent ensemble, puis l'accueil du site.
 */
export function BoutonDeDeconnexion({ className, ...props }: Omit<ComponentProps<'button'>, 'onClick' | 'type'>) {
  const t = useTranslations('profile.sommaire');
  const { logout } = useAuth();
  const router = useRouter();
  const locale = useLocale() as Locale;
  return (
    <button
      type="button"
      {...props}
      onClick={() => void logout().then(() => router.replace(hrefLocalise('/', locale)))}
      className={className}
    >
      <LogOut className="size-icone flex-none text-muted-foreground max-md:size-5" strokeWidth={1.5} aria-hidden="true" />
      {t('deconnexion')}
    </button>
  );
}
