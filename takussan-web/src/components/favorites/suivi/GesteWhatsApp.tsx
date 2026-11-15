'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { numerosDuBien, premierNumeroWhatsApp } from '@/components/contact/numeros-du-bien';
import { useToast } from '@/components/ui/toast';
import { signalerClic } from '@/lib/contact-click';
import { cn } from '@/lib/utils';

export interface GesteWhatsAppProps {
  readonly slug: string;
  readonly title: string;
  readonly className?: string;
}

/**
 * TCK-2508 — « WhatsApp » sur la carte d'un favori (décision 4a de l'audit).
 *
 * Même mécanique que `WhatsAppButton` de la fiche (TCK-590) : la fenêtre s'ouvre DANS le geste
 * (Safari iOS bloque une ouverture qui suit un `await`), le numéro est révélé au geste sous
 * limiteur, le clic est signalé sans identité. Deux différences, et elles sont la raison de ce
 * composant :
 *
 * - le message prérempli cite l'adresse de la FICHE, pas celle de la page courante (la page des
 *   favoris n'apprendrait rien à l'annonceur) ;
 * - la carte ne sait pas si le contact a WhatsApp : ni `GET /api/favorites` ni `by-ids` n'émettent
 *   `primary_contact.has_whatsapp` (mesuré le 2026-11-09). Sans numéro WhatsApp, le geste le DIT
 *   (toast) et renvoie à la fiche, où les autres moyens de contact sont proposés.
 */
export function GesteWhatsApp({ slug, title, className }: GesteWhatsAppProps) {
  const t = useTranslations('favorites.suivi.whatsapp');
  const locale = useLocale();
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);

  async function ouvrir() {
    const fenetre = window.open('', '_blank');
    setEnCours(true);
    signalerClic(slug, 'whatsapp');
    try {
      const numero = premierNumeroWhatsApp(await numerosDuBien(slug));
      const telephone = numero?.phone.replace(/\D/g, '') ?? '';
      if (!telephone) {
        fenetre?.close();
        toast.add({ title: t('indisponibleTitre'), description: t('indisponible'), type: 'info' });
        return;
      }
      const fiche = `${window.location.origin}/${locale}/properties/${encodeURIComponent(slug)}`;
      const url = `https://wa.me/${telephone}?text=${encodeURIComponent(t('prefill', { title, url: fiche }))}`;
      if (fenetre) {
        fenetre.opener = null;
        fenetre.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch {
      fenetre?.close();
      toast.add({ title: t('erreurTitre'), description: t('erreur'), type: 'error' });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void ouvrir()}
      disabled={enCours}
      aria-label={t('aria', { title })}
      className={cn(
        'inline-flex size-10 flex-none items-center justify-center rounded-lg bg-success text-success-foreground transition-[background-color,scale] duration-150 hover:bg-success/90 active:scale-[0.96] disabled:cursor-wait disabled:opacity-60',
        className,
      )}
    >
      {enCours ? (
        <Loader2 className="size-icone animate-spin" aria-hidden="true" />
      ) : (
        <svg className="size-icone" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      )}
    </button>
  );
}
