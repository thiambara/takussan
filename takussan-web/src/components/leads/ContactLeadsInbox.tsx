'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Inbox, Mail, MessageCircle, Phone } from 'lucide-react';
import {
  type ContactLead,
  type FiltreDesDemandes,
  useAssignLead,
  useContactLeads,
  useConvertLead,
  useHandleLead,
} from '@/lib/queries/contact-leads';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/format';
import { isAdmin } from '@/lib/roles';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Pagination, StatusBadge } from '@/components/console';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/config';
import type { PaginatedResponse } from '@/types/api';
import type { User } from '@/types/user';

const FILTRES: readonly FiltreDesDemandes[] = ['todo', 'handled', 'all'];

/**
 * TCK-590 — la boîte « Demandes ».
 *
 * Chaque demande se lit EN ENTIER — message, téléphone, e-mail — et se traite en un geste :
 * répondre par WhatsApp, appeler, écrire, convertir en client, marquer traitée, attribuer. La
 * notification d'avant tronquait le message à 80 caractères et omettait le téléphone : l'agent
 * apprenait qu'on l'avait contacté, pas de quoi répondre.
 */
export function ContactLeadsInbox() {
  const t = useTranslations('contactLeads');
  const [filtre, setFiltre] = useState<FiltreDesDemandes>('todo');
  const [page, setPage] = useState(1);
  const query = useContactLeads(filtre, page);

  return (
    <div className="space-y-4">
      <Tabs
        value={filtre}
        onValueChange={(v) => {
          setFiltre((v as FiltreDesDemandes) ?? 'todo');
          setPage(1);
        }}
      >
        <TabsList>
          {FILTRES.map((f) => (
            <TabsTrigger key={f} value={f}>
              {t(`filters.${f}`)}
              {f === filtre && typeof query.data?.meta?.total === 'number' && (
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{query.data.meta.total}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : query.isError || !query.data ? (
        <ErrorState message={t('error')} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-8" aria-hidden="true" />}
          title={t(`empty.${filtre}`)}
          description={t('empty.description')}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {query.data.data.map((lead) => (
              <DemandeDeContact key={lead.id} lead={lead} />
            ))}
          </ul>
          {query.data.meta.last_page > 1 && (
            <Pagination page={page} lastPage={query.data.meta.last_page} onChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}

function nomComplet(u: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
}

function DemandeDeContact({ lead }: { lead: ContactLead }) {
  const t = useTranslations('contactLeads');
  const locale = useLocale() as Locale;
  const toast = useToast();
  const { user } = useAuth();
  const handle = useHandleLead();
  const convert = useConvertLead();
  const [customerId, setCustomerId] = useState<number | null>(lead.customer_id);
  const [attribuer, setAttribuer] = useState(false);

  const nom = lead.name?.trim() || t('anonymous');
  const telephone = lead.phone?.replace(/\D/g, '') ?? '';
  const reponse = lead.property
    ? t('whatsappReplyProperty', { name: nom, title: lead.property.title })
    : t('whatsappReply', { name: nom });
  // La liste des collègues (`GET /agencies/{id}/members`) est réservée à l'administrateur de
  // l'agence : un agent détient `crm.assign`, mais le menu qu'on lui ouvrirait serait vide.
  const peutAttribuer = user ? isAdmin(user.roles) : false;

  async function marquerTraitee() {
    try {
      await handle.mutateAsync({ id: lead.id });
      toast.add({ title: t('toasts.handled'), type: 'success' });
    } catch {
      toast.add({ title: t('toasts.error'), type: 'error' });
    }
  }

  async function convertir() {
    try {
      const res = await convert.mutateAsync({ id: lead.id });
      setCustomerId(res.customer.id);
      toast.add({ title: t('toasts.converted'), type: 'success' });
    } catch {
      toast.add({ title: t('toasts.error'), type: 'error' });
    }
  }

  return (
    <li className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold text-foreground">{nom}</p>
          <p className="text-xs text-muted-foreground">
            {lead.property ? (
              <Link href={`/properties/${lead.property.slug}`} className="hover:underline">
                {t('aboutProperty', { title: lead.property.title })}
              </Link>
            ) : (
              t('aboutAgent')
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {lead.handled_at ? (
            <StatusBadge tone="success" label={t('handledAt', { date: formatDateTime(lead.handled_at, locale) })} />
          ) : null}
          <span className="tabular-nums">{t('receivedAt', { date: formatDateTime(lead.created_at, locale) })}</span>
        </div>
      </div>

      {lead.message ? (
        <p className="whitespace-pre-line text-pretty text-sm text-foreground">{lead.message}</p>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {lead.phone ? <span className="tabular-nums">{lead.phone}</span> : null}
        {lead.email ? <span className="break-all">{lead.email}</span> : null}
        {lead.recipient ? <span>{t('recipient', { name: nomComplet(lead.recipient) })}</span> : null}
        {lead.source ? <span>{t('source', { source: lead.source })}</span> : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:flex-wrap">
        {telephone ? (
          <a
            href={`https://wa.me/${telephone}?text=${encodeURIComponent(reponse)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-10 gap-2 sm:h-8')}
          >
            <MessageCircle className="size-4" aria-hidden />
            {t('actions.whatsapp')}
          </a>
        ) : null}
        {lead.phone ? (
          <a href={`tel:${lead.phone.replace(/\s/g, '')}`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 gap-2 sm:h-8')}>
            <Phone className="size-4" aria-hidden />
            {t('actions.call')}
          </a>
        ) : null}
        {lead.email ? (
          <a href={`mailto:${lead.email}`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 gap-2 sm:h-8')}>
            <Mail className="size-4" aria-hidden />
            {t('actions.email')}
          </a>
        ) : null}
        {customerId ? (
          <Link href={`/app/customers/${customerId}`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 sm:h-8')}>
            {t('actions.openCustomer')}
          </Link>
        ) : (
          <Button variant="outline" className="h-10 sm:h-8" onClick={() => void convertir()} disabled={convert.isPending}>
            {t('actions.convert')}
          </Button>
        )}
        {!lead.handled_at && !customerId ? (
          <Button className="h-10 sm:h-8" onClick={() => void marquerTraitee()} disabled={handle.isPending}>
            {t('actions.handle')}
          </Button>
        ) : null}
        {peutAttribuer && !lead.handled_at ? (
          <Button variant="ghost" className="h-10 sm:h-8" onClick={() => setAttribuer(true)}>
            {t('actions.assign')}
          </Button>
        ) : null}
      </div>

      {attribuer && user?.agency_id ? (
        <AttribuerDialog leadId={lead.id} agencyId={user.agency_id} onClose={() => setAttribuer(false)} />
      ) : null}
    </li>
  );
}

function AttribuerDialog({ leadId, agencyId, onClose }: { leadId: number; agencyId: number; onClose: () => void }) {
  const t = useTranslations('contactLeads');
  const toast = useToast();
  const assign = useAssignLead();
  const [choisi, setChoisi] = useState<number | null>(null);
  const membres = useApiQuery<PaginatedResponse<User>>(
    ['agency-members', agencyId, 'assign'],
    `/api/agencies/${agencyId}/members`,
    { params: { fields: { users: ['id', 'first_name', 'last_name'] }, per_page: 100 } },
  );

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
            <select
              id={`lead-${leadId}-assignee`}
              value={choisi ?? ''}
              onChange={(e) => setChoisi(e.target.value ? Number(e.target.value) : null)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">{t('assign.placeholder')}</option>
              {(membres.data?.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {nomComplet(m)}
                </option>
              ))}
            </select>
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
