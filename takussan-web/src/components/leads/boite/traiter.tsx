'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Undo2 } from 'lucide-react';

import { ActionDuToast, useToast } from '@/components/ui/toast';
import { type ContactLead, useHandleLead, useUnhandleLead } from '@/lib/queries/contact-leads';

/** Le temps laissé pour « Annuler » (maquette `app-demandes` a-3). */
export const DELAI_D_ANNULATION_MS = 6000;

/**
 * TCK-2885 — marquer une demande traitée, avec « Annuler » sur le toast pendant 6 s (`POST
 * …/unhandle`, TCK-2884). Vit au niveau de la BOÎTE, pas de la demande ouverte : celle-ci se démonte
 * dès que la liste se relit (ou que T passe à la suivante), le toast et sa mutation doivent lui
 * survivre. `onAnnulee` est relu au moment du clic (une référence), jamais figé au traitement.
 */
export function useTraiterLaDemande({ onTraitee, onAnnulee }: { onTraitee?: (lead: ContactLead) => void; onAnnulee?: (lead: ContactLead) => void } = {}) {
  const t = useTranslations('contactLeads');
  const toast = useToast();
  const handle = useHandleLead();
  const unhandle = useUnhandleLead();
  const rappels = useRef({ onTraitee, onAnnulee });
  useEffect(() => {
    rappels.current = { onTraitee, onAnnulee };
  });

  async function annuler(lead: ContactLead, toastId: string) {
    toast.close(toastId);
    try {
      await unhandle.mutateAsync({ id: lead.id });
      rappels.current.onAnnulee?.(lead);
    } catch {
      toast.add({ title: t('toasts.error'), type: 'error' });
    }
  }

  /** `court` : « Demande traitée. » (la barre du retour), sinon « Demande marquée traitée. ». */
  async function traiter(lead: ContactLead, { court = false }: { court?: boolean } = {}): Promise<boolean> {
    try {
      await handle.mutateAsync({ id: lead.id });
    } catch {
      toast.add({ title: t('toasts.error'), type: 'error' });
      return false;
    }
    const toastId: string = toast.add({
      title: t(court ? 'toasts.handledShort' : 'toasts.handled'),
      type: 'success',
      timeout: DELAI_D_ANNULATION_MS,
      data: {
        action: (
          <ActionDuToast onClick={() => void annuler(lead, toastId)}>
            <Undo2 strokeWidth={1.75} aria-hidden="true" />
            {t('toasts.undo')}
          </ActionDuToast>
        ),
      },
    });
    rappels.current.onTraitee?.(lead);
    return true;
  }

  return { traiter, enCours: handle.isPending };
}
