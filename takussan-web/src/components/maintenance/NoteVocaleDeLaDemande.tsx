'use client';

import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { PastilleDeNoteVocale } from '@/components/note-vocale/PastilleDeNoteVocale';
import { maintenanceKeys } from '@/lib/queries/maintenance';
import type { MaintenanceRequest, MaintenanceVoiceNote } from '@/types/maintenance';

/**
 * TCK-2902 (ADR-0113 § 4) — la note vocale du signalement, sous la description : « Message vocal · 0:18 »
 * (maquette `app-interventions`, « Fiche — à dispatcher »). Rendue quand l'API sert `media.voice_note`
 * — aucune décision de lecteur ici : le prestataire l'entend si l'API la lui rend.
 *
 * L'URL est signée pour 30 min : une lecture qui échoue relit la fiche UNE fois (une URL neuve), jamais
 * en boucle sur un fichier illisible.
 */
export function NoteVocaleDeLaDemande({ request, className }: { readonly request: Pick<MaintenanceRequest, 'id' | 'media'>; readonly className?: string }) {
  const note = request.media?.voice_note ?? null;
  // Sans note, rien — pas même un client de requêtes : la fiche se rend sans lui (tests compris).
  if (!note) return null;
  return <Pastille id={request.id} note={note} className={className} />;
}

function Pastille({ id, note, className }: { readonly id: number; readonly note: MaintenanceVoiceNote; readonly className?: string }) {
  const queryClient = useQueryClient();
  const relue = useRef(false);
  return (
    <PastilleDeNoteVocale
      src={note.url}
      duree={note.duration}
      className={className}
      onErreur={() => {
        if (relue.current) return;
        relue.current = true;
        void queryClient.invalidateQueries({ queryKey: maintenanceKeys.detail(id) });
      }}
    />
  );
}
