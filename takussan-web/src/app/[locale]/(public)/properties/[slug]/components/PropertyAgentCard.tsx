'use client';
import Image from 'next/image';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useTranslations } from 'next-intl';
import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PropertyAgencyLite, PropertyOwnerLite } from '@/types/property';
import { PropertyPhoneVerifiedBadge } from './PropertyPhoneVerifiedBadge';

interface PropertyAgentCardProps {
  /**
   * TCK-502 — **le CONTACT, pas le propriétaire.** Cette prop s'appelait `owner` et recevait
   * `property.owner` : la carte montrait le nom et le visage du propriétaire pendant que le
   * bouton « Envoyer un message », deux lignes plus bas, ouvrait un fil avec le collaborateur
   * `agent`, et que « Appeler » composait un troisième numéro. L'appelant passe désormais
   * `property.primary_contact`, calculé côté serveur par la MÊME règle que les trois chemins
   * d'envoi. Le nom de la prop porte la correction : `owner` invitait à repasser le propriétaire.
   */
  contact: PropertyOwnerLite;
  agency: PropertyAgencyLite | null;
  readonly className?: string;
}

/**
 * TCK-2501 — **la carte dit QUI, elle n'offre plus de canal.** Elle portait « Message », « Appeler »
 * et WhatsApp : la fiche avait alors deux portes « message » (celle-ci et la carte de réservation),
 * et WhatsApp, le canal de contact par défaut à Dakar, était relégué à ~2 700 px en mobile (audit UX
 * 2026-11). Les canaux vivent désormais dans la barre basse (mobile) et la carte de réservation
 * (bureau) — `actions-de-la-fiche.ts` ; le geste d'appel, inchangé, dans `useAppelDuBien`.
 */
export function PropertyAgentCard({ contact, agency, className }: PropertyAgentCardProps) {
  const t = useTranslations('propertyDetail.agent');
  // TCK-1313 (P85.04) — un espace `individual` n'a pas de fiche d'agence (l'API la refuse en 404) :
  // son nom mène à la fiche de la personne, ou n'est qu'écrit sans slug de contact.
  const lienAgence = !agency
    ? null
    : agency.kind === 'individual'
      ? contact.slug
        ? `/agents/${contact.slug}`
        : null
      : `/agencies/${agency.slug}`;

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center gap-3">
        <div className="relative size-12 shrink-0 rounded-full overflow-hidden bg-muted">
          {contact.avatar_url ? (
            <Image
              src={contact.avatar_url}
              alt={contact.name}
              fill
              sizes="48px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground font-semibold">
              {contact.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          {/* TCK-907 (P31.07) — les liens de l'agent et de l'agence : cibles de 24 px (WCAG
              2.5.8), `min-h-6` sur une boîte (`inline-block` pour l'agent, enfant flex pour
              l'agence), et soulignés en permanence : la graisse seule ne les distinguait pas. */}
          <p className="font-display font-semibold text-foreground truncate">
            {contact.slug ? (
              <LienLocalise
                href={`/agents/${contact.slug}`}
                className="inline-block min-h-6 max-w-full truncate align-top leading-6 underline underline-offset-2"
              >
                {contact.name}
              </LienLocalise>
            ) : (
              contact.name
            )}
          </p>
          <PropertyPhoneVerifiedBadge verified={contact.phone_verified} />
          {/* TCK-505 (#12) — c'est le LIEN de l'agence qui tronque, pas le paragraphe. `truncate`
              sur le `<p>` posait `nowrap` sur le lien, enfant flex dont la largeur minimale reste
              celle de son texte : à 360 px, la page entière s'élargissait à 369 (viewport mesuré). */}
          {agency ? (
            <p className="text-sm text-muted-foreground flex items-center gap-1 min-w-0">
              {lienAgence ? (
                <LienLocalise
                  href={lienAgence}
                  className="min-h-6 min-w-0 truncate leading-6 underline underline-offset-2"
                >
                  {agency.name}
                </LienLocalise>
              ) : (
                <span className="min-w-0 truncate leading-6">{agency.name}</span>
              )}
              {agency.verified && (
                <BadgeCheck className="size-4 text-primary shrink-0" aria-label={t('verifiedAria')} />
              )}
            </p>
          ) : contact.is_agent ? (
            <p className="text-sm text-muted-foreground">{t('independent')}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('private')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
