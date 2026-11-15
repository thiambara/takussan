'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useApiQuery } from '@/hooks/useApiQuery';
import { nomAffichable } from '@/lib/identite';
import { useAssignLead } from '@/lib/queries/contact-leads';
import type { PaginatedResponse } from '@/types/api';
import type { User } from '@/types/user';

/** Valeur repère de « aucun membre choisi » : une valeur vide n'est pas une option du Select. */
const AUCUN_MEMBRE = '__none__';

/**
 * Attribuer une demande à un collègue de L'AGENCE DE LA DEMANDE (TCK-2584 : la liste prenait celle de
 * l'utilisateur, `user.agency_id`, que la règle de l'API ne regarde pas).
 */
export function AttribuerDialog({ leadId, agencyId, onClose }: { readonly leadId: number; readonly agencyId: number; readonly onClose: () => void }) {
  const t = useTranslations('contactLeads');
  const toast = useToast();
  const assign = useAssignLead();
  const [choisi, setChoisi] = useState<number | null>(null);
  // P120.01 (TCK-1246) — `filter[assignable]=1` ne garde que le personnel joignable de l'agence,
  // la règle de `PersonnelDeLAgence` qui juge la cible : sans lui, la liste offrait les bailleurs,
  // les comptes bloqués et les agents suspendus, refusés ensuite en 422.
  const membres = useApiQuery<PaginatedResponse<User>>(['agency-members', agencyId, 'assign'], `/api/agencies/${agencyId}/members`, {
    params: { fields: { users: ['id', 'first_name', 'last_name'] }, filter: { assignable: 1 }, sort: 'first_name', per_page: 100 },
  });

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!choisi) return;
    try {
      await assign.mutateAsync({ id: leadId, user_id: choisi });
      toast.add({ title: t('toasts.assigned'), type: 'success' });
      onClose();
    } catch {
      toast.add({ title: t('toasts.error'), type: 'error' });
    }
  }

  const optionsMembre = [
    { value: AUCUN_MEMBRE, label: t('assign.placeholder') },
    // P220.05 — le nom d'un collègue, jamais vide : `#<id>` faute de mieux.
    ...(membres.data?.data ?? []).map((m) => ({ value: String(m.id), label: nomAffichable(m) })),
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void valider(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('assign.title')}</DialogTitle>
            <DialogDescription>{t('assign.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`lead-${leadId}-assignee`} className="block text-sm font-medium text-foreground">
              {t('assign.label')}
            </label>
            <Select
              value={choisi === null ? AUCUN_MEMBRE : String(choisi)}
              onValueChange={(next) => {
                if (next === null) return;
                setChoisi(next === AUCUN_MEMBRE ? null : Number(next));
              }}
              items={optionsMembre}
            >
              <SelectTrigger id={`lead-${leadId}-assignee`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsMembre.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('assign.cancel')}
            </Button>
            <Button type="submit" disabled={!choisi || assign.isPending}>
              {t('assign.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
