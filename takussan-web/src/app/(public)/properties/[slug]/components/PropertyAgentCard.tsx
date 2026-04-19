'use client';
import Image from 'next/image';
import { BadgeCheck, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppButton } from '@/components/contact/WhatsAppButton';
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
        <a
          href={`tel:+221`}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 h-9 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          aria-label="Appeler"
        >
          <Phone className="size-4" aria-hidden />
          Appeler
        </a>
      </div>

      <WhatsAppButton slug={propertySlug} title={propertyTitle} />
    </div>
  );
}
