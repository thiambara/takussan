import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/*
 * TCK-2576 — l'icône et le lien WhatsApp d'une fiche, à part de `WhatsAppButton` (qui les réutilise) :
 * ce fichier ne lit aucun espace de traduction, et la fiche d'agent ou d'agence qui l'importe
 * n'embarque pas pour autant `contact` ni `propertyContact` (`check-i18n-namespaces`).
 */

/** L'icône WhatsApp, partagée par le bouton d'un bien et le lien d'une fiche (TCK-2576). */
export function IconeWhatsApp({ className }: { readonly className?: string }) {
  return (
    <svg
      className={cn('w-5 h-5 flex-none', className)}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/**
 * TCK-2576 — le lien `wa.me` d'un numéro DÉJÀ PUBLIÉ (fiche d'agent ou d'agence) : les chiffres seuls,
 * indicatif compris, et le message prérempli. `null` pour un numéro sans assez de chiffres : pas de lien
 * plutôt qu'un lien mort.
 */
export function lienWaMe(numero: string, texte?: string): string | null {
  const chiffres = numero.replace(/\D/g, '');
  if (chiffres.length < 8) return null;
  return `https://wa.me/${chiffres}${texte ? `?text=${encodeURIComponent(texte)}` : ''}`;
}

interface LienWhatsAppProps extends Omit<ComponentProps<'a'>, 'href' | 'children'> {
  /** Le numéro publié, que l'API a dit sur WhatsApp. */
  readonly numero: string;
  /** Le message prérempli, déjà traduit. */
  readonly texte?: string;
  readonly children?: ReactNode;
}

/**
 * TCK-2576 — WhatsApp sur une fiche d'agent ou d'agence : le numéro est connu au rendu (servi par
 * l'API publique, seulement s'il est déclaré WhatsApp), donc un simple lien — ni requête, ni fenêtre
 * ouverte dans le geste, ni toast, à la différence du bouton d'un bien ({@link WhatsAppButton}).
 */
export function LienWhatsApp({ numero, texte, className, children, ...attributs }: LienWhatsAppProps) {
  const href = lienWaMe(numero, texte);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...attributs}>
      <IconeWhatsApp className="size-[18px]" />
      {children}
    </a>
  );
}
