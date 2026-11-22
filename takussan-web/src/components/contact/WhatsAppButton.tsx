'use client';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/toast';
import { signalerClic } from '@/lib/contact-click';
import { cn } from '@/lib/utils';

import { IconeWhatsApp } from './LienWhatsApp';

import { numerosDuBien, premierNumeroWhatsApp } from './numeros-du-bien';

interface Props {
  slug: string;
  title: string;
  /**
   * TCK-633 (lot C) — au moins un numéro du bien est déclaré WhatsApp
   * (`primary_contact.has_whatsapp`). Sans lui, pas de bouton : il visait un numéro qui n'a
   * peut-être pas WhatsApp. (TCK-590 le gardait sur `has_phone`.)
   */
  hasWhatsApp: boolean;
  /** TCK-2501 — classes fusionnées (`twMerge`) : la barre basse le pose à égalité avec « Visiter ». */
  className?: string;
  /** TCK-2501 — libellé court (« WhatsApp ») ; sans lui, « Contacter via WhatsApp ». */
  children?: ReactNode;
}

/**
 * TCK-590 — trois défauts corrigés ici.
 *
 *   · **La fenêtre s'ouvre DANS le geste.** `window.open` suivait un `await` : Safari iOS ne
 *     l'associe plus au clic et bloque la fenêtre — WhatsApp ne s'ouvrait jamais sur iPhone. La
 *     fenêtre est ouverte vide au clic, puis dirigée vers `wa.me` quand le numéro arrive.
 *   · **Le message prérempli est traduit ici**, dans la langue du visiteur. L'API le construisait
 *     en français figé.
 *   · **Plus de boîte d'alerte native** : un toast, et la fenêtre ouverte pour rien est refermée.
 */
export function WhatsAppButton({ slug, title, hasWhatsApp, className, children }: Props) {
  const t = useTranslations('contact.whatsapp');
  const tContact = useTranslations('propertyContact');
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  if (!hasWhatsApp) return null;

  async function handleContact() {
    // Dans le geste, AVANT tout `await` : c'est la seule ouverture qu'iOS laisse passer.
    const fenetre = window.open('', '_blank');
    setLoading(true);
    signalerClic(slug, 'whatsapp');
    try {
      const numero = premierNumeroWhatsApp(await numerosDuBien(slug));
      const phone = numero?.phone.replace(/\D/g, '') ?? '';
      if (!phone) throw new Error('phone');
      const page = `${window.location.origin}${window.location.pathname}`;
      const message = encodeURIComponent(tContact('whatsapp.prefill', { title, url: page }));
      const url = `https://wa.me/${phone}?text=${message}`;
      if (fenetre) {
        fenetre.opener = null;
        fenetre.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch {
      fenetre?.close();
      toast.add({ title: tContact('errors.title'), description: t('error'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleContact}
      disabled={loading}
      aria-label={t('aria', { title })}
      type="button"
      className={cn(
        'w-full flex items-center justify-center gap-3 bg-success hover:bg-success/90 disabled:opacity-60 text-success-foreground font-semibold min-h-11 py-3 px-6 rounded-lg transition-[background-color,scale] active:scale-[0.96] duration-150 cursor-pointer disabled:cursor-not-allowed',
        className,
      )}
    >
      <IconeWhatsApp />
      {loading ? t('connecting') : (children ?? t('cta'))}
    </button>
  );
}

