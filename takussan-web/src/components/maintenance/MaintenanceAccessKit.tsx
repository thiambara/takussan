'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MapPin, MessageCircle, Phone } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import type { MaintenanceAccess, MaintenanceRequest } from '@/types/maintenance';

/**
 * TCK-592 (P6, P19) — ce dont le prestataire a besoin sur le terrain : l'adresse, « Itinéraire »,
 * « Appeler le locataire », les consignes d'accès — et « Discuter », le fil de l'intervention.
 *
 * Le bloc `access` n'est rendu par l'API qu'au prestataire assigné, après acceptation, tant que la
 * demande n'est ni close ni annulée : sa seule présence décide de l'affichage. « Discuter » vaut
 * pour tout participant du fil (`conversation_id`).
 */
export function MaintenanceAccessKit({ request }: { readonly request: MaintenanceRequest }) {
  const t = useTranslations('maintenance.intervention.access');
  const access = request.access;
  const conversationId = request.conversation_id ?? null;

  if (!access && conversationId === null) return null;

  const directions = access ? directionsUrl(access) : null;
  const address = access
    ? [access.street, access.quarter, access.city].filter(Boolean).join(', ')
    : '';

  return (
    <section className="rounded-xl bg-card p-4 sm:p-5">
      {access ? (
        <>
          <h2 className="font-display text-base font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-1 text-sm text-foreground">{address || t('address_missing')}</p>
          {access.instructions ? (
            <div className="mt-3 rounded-lg bg-muted p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('instructions')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{access.instructions}</p>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {directions ? (
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ className: 'h-11 sm:h-9' })}
          >
            <MapPin aria-hidden="true" />
            {t('directions')}
          </a>
        ) : null}
        {access?.requester_phone ? (
          <a
            href={`tel:${access.requester_phone}`}
            className={buttonVariants({ variant: 'outline', className: 'h-11 sm:h-9' })}
          >
            <Phone aria-hidden="true" />
            {t('call_requester')}
          </a>
        ) : null}
        {conversationId !== null ? (
          <Link
            href={`/app/messages?conversation=${conversationId}`}
            className={buttonVariants({ variant: 'outline', className: 'h-11 sm:h-9' })}
          >
            <MessageCircle aria-hidden="true" />
            {t('discuss')}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** Les coordonnées quand elles existent, sinon l'adresse en clair. */
function directionsUrl(access: MaintenanceAccess): string | null {
  if (access.latitude !== null && access.longitude !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${access.latitude},${access.longitude}`;
  }
  const address = [access.street, access.quarter, access.city].filter(Boolean).join(', ');
  return address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null;
}
