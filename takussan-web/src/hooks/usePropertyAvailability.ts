'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { OccupiedRange } from '@/lib/occupancy';

interface AvailabilityResponse {
  data: { from: string; to: string; occupied: OccupiedRange[] };
}

/**
 * TCK-596 §3B — les nuits occupées d'un bien public (18 mois devant), pour griser le calendrier du
 * tunnel. Une lecture qui échoue n'empêche rien : le serveur refuse quand même, et le dialogue
 * affiche son refus.
 */
export function usePropertyAvailability(slug: string, enabled: boolean): readonly OccupiedRange[] {
  const [occupied, setOccupied] = useState<readonly OccupiedRange[]>([]);

  useEffect(() => {
    if (!enabled || !slug) return;
    let cancelled = false;
    apiFetch<AvailabilityResponse>(`/public/properties/${encodeURIComponent(slug)}/availability`)
      .then((res) => {
        if (!cancelled) setOccupied(res.data.occupied ?? []);
      })
      .catch(() => {
        if (!cancelled) setOccupied([]);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, enabled]);

  return occupied;
}
