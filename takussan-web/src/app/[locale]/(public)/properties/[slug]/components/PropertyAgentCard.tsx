'use client';
import Image from 'next/image';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppButton } from '@/components/contact/WhatsAppButton';
import { apiFetch } from '@/lib/api';
import type { PropertyAgencyLite, PropertyOwnerLite } from '@/types/property';

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
  propertySlug: string;
  propertyTitle: string;
  onMessage: () => void;
  /** TCK-500 — cf. `PropertyBookingCard` : pas de bouton quand on est soi-même le destinataire. */
  canMessage?: boolean;
}

export function PropertyAgentCard({
  contact,
  agency,
  propertySlug,
  propertyTitle,
  onMessage,
  canMessage = true,
}: PropertyAgentCardProps) {
  const t = useTranslations('property.detail.agent');
  const [calling, setCalling] = useState(false);

  async function handleCall() {
    setCalling(true);
    try {
      const res = await apiFetch<{ phone: string | null }>(
        `/public/properties/${propertySlug}/contact`,
      );
      if (res.phone) {
        window.location.href = `tel:${res.phone.replace(/\s/g, '')}`;
      } else {
        alert(t('phoneUnavailable'));
      }
    } catch {
      alert(t('phoneError'));
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative size-12 shrink-0 rounded-full overflow-hidden bg-stone-100">
          {contact.avatar_url ? (
            <Image
              src={contact.avatar_url}
              alt={contact.name}
              fill
              sizes="48px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-stone-500 font-semibold">
              {contact.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-stone-900 truncate">
            {contact.slug ? (
              <LienLocalise href={`/agents/${contact.slug}`} className="hover:underline">
                {contact.name}
              </LienLocalise>
            ) : (
              contact.name
            )}
          </p>
          {/* TCK-505 (#12) — c'est le LIEN de l'agence qui tronque, pas le paragraphe. `truncate`
              sur le `<p>` posait `nowrap` sur le lien, enfant flex dont la largeur minimale reste
              celle de son texte : à 360 px, la page entière s'élargissait à 369 (viewport mesuré). */}
          {agency ? (
            <p className="text-sm text-stone-600 flex items-center gap-1 min-w-0">
              <LienLocalise
                href={`/agencies/${agency.slug}`}
                className="min-w-0 truncate hover:underline"
              >
                {agency.name}
              </LienLocalise>
              {agency.verified && (
                <BadgeCheck className="size-4 text-sky-500 shrink-0" aria-label={t('verifiedAria')} />
              )}
            </p>
          ) : contact.is_agent ? (
            <p className="text-sm text-stone-500">{t('independent')}</p>
          ) : (
            <p className="text-sm text-stone-500">{t('private')}</p>
          )}
        </div>
      </div>

      <div className={canMessage ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
        {canMessage && (
          <Button type="button" variant="outline" onClick={onMessage} className="gap-2">
            <MessageCircle className="size-4" aria-hidden />
            {t('message')}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={handleCall}
          disabled={calling}
          className="gap-2"
          aria-label={t('callAria')}
        >
          <Phone className="size-4" aria-hidden />
          {calling ? 'Connexion…' : 'Appeler'}
        </Button>
      </div>

      <WhatsAppButton slug={propertySlug} title={propertyTitle} />
    </div>
  );
}
