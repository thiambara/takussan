'use client';
import Image from 'next/image';
import { useState } from 'react';
import { BadgeCheck, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppButton } from '@/components/contact/WhatsAppButton';
import { apiFetch } from '@/lib/api';
import type { PropertyAgencyLite, PropertyOwnerLite } from '@/types/property';

interface PropertyAgentCardProps {
  owner: PropertyOwnerLite;
  agency: PropertyAgencyLite | null;
  propertySlug: string;
  propertyTitle: string;
  onMessage: () => void;
}

export function PropertyAgentCard({
  owner,
  agency,
  propertySlug,
  propertyTitle,
  onMessage,
}: PropertyAgentCardProps) {
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
        alert('Numéro de téléphone indisponible pour ce bien.');
      }
    } catch {
      alert('Impossible de récupérer le numéro. Veuillez réessayer.');
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative size-12 shrink-0 rounded-full overflow-hidden bg-stone-100">
          {owner.avatar_url ? (
            <Image
              src={owner.avatar_url}
              alt={owner.name}
              fill
              sizes="48px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-stone-500 font-semibold">
              {owner.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-stone-900 truncate">{owner.name}</p>
          {agency ? (
            <p className="text-sm text-stone-600 flex items-center gap-1 truncate">
              {agency.name}
              {agency.verified && (
                <BadgeCheck className="size-4 text-sky-500 shrink-0" aria-label="Agence vérifiée" />
              )}
            </p>
          ) : owner.is_agent ? (
            <p className="text-sm text-stone-500">Agent indépendant</p>
          ) : (
            <p className="text-sm text-stone-500">Particulier</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onMessage} className="gap-2">
          <MessageCircle className="size-4" aria-hidden />
          Message
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleCall}
          disabled={calling}
          className="gap-2"
          aria-label="Appeler"
        >
          <Phone className="size-4" aria-hidden />
          {calling ? 'Connexion…' : 'Appeler'}
        </Button>
      </div>

      <WhatsAppButton slug={propertySlug} title={propertyTitle} />
    </div>
  );
}
