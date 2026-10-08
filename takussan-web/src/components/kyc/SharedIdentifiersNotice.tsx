'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';

import type { SharedLegalIdentifiers } from '@/types/super-admin';
import { cn } from '@/lib/utils';

interface SharedIdentifiersNoticeProps {
  readonly shared: SharedLegalIdentifiers | null | undefined;
  readonly className?: string;
}

/**
 * TCK-601 (C) — « Identifiant déjà porté par : <agences> », pour le NINEA et le RIB professionnel.
 *
 * Un SIGNAL pour la revue, jamais un refus : l'encart est sobre (fond neutre, aucune couleur
 * d'alerte) et ne bloque aucun bouton. Deux agences peuvent légitimement partager un NINEA — une
 * filiale, une reprise. La clé `shared_identifiers` n'est émise qu'au super-admin ; absente ou
 * vide, rien n'est rendu.
 */
export function SharedIdentifiersNotice({ shared, className }: SharedIdentifiersNoticeProps) {
  const t = useTranslations('kyc.sharedIdentifiers');
  if (!shared) return null;

  const lignes = (['ninea', 'rib_pro'] as const)
    .map((cle) => ({ cle, agences: shared[cle] ?? [] }))
    .filter((l) => l.agences.length > 0);
  if (lignes.length === 0) return null;

  return (
    <div
      className={cn('flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-foreground', className)}
      data-testid="kyc-shared-identifiers"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        {lignes.map(({ cle, agences }) => (
          <p key={cle} className="text-pretty">
            <span className="font-medium">{t(cle)}</span>
            {' — '}
            {t('alreadyHeldBy')}{' '}
            {agences.map((agence, i) => (
              <span key={agence.id}>
                {i > 0 ? ', ' : null}
                <Link
                  href={`/super-admin/agencies/${agence.id}`}
                  className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
                >
                  {agence.name}
                </Link>
              </span>
            ))}
          </p>
        ))}
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
      </div>
    </div>
  );
}
