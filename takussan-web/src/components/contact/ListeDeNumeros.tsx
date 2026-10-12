'use client';

import { MessageCircle, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { NumeroDeContact } from './numeros-du-bien';

/** TCK-633 (lot C) — les numéros d'un bien, révélés au geste « Appeler », chacun composable. */
export function ListeDeNumeros({ numeros }: { readonly numeros: readonly NumeroDeContact[] }) {
  const t = useTranslations('property.contacts.public');

  const libelle = (n: NumeroDeContact) =>
    n.kind === 'primary' ? t('kind.primary') : n.kind === 'secondary' ? t('kind.secondary') : (n.label ?? t('kind.onSite'));

  return (
    <ul className="space-y-2" data-testid="numeros-de-contact" aria-label={t('listAria')}>
      {numeros.map((n, i) => (
        <li key={`${n.kind}-${i}`}>
          <a
            href={`tel:${n.phone.replace(/\s/g, '')}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Phone className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground tabular-nums">{n.phone}</span>
                <span className="block truncate text-xs text-muted-foreground">{libelle(n)}</span>
              </span>
            </span>
            {n.whatsapp ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-success">
                <MessageCircle className="size-3.5" aria-hidden="true" />
                {t('whatsapp')}
              </span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
