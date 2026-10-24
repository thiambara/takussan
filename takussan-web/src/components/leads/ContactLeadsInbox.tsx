'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Inbox, Mail, MessageCircle, Phone } from 'lucide-react';
import {
  type ContactLead,
  type FiltreDesDemandes,
  useAssignLead,
  useContactLeads,
  useContactLead,
  useConvertLead,
  useHandleLead,
} from '@/lib/queries/contact-leads';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useCan } from '@/hooks/useCan';
import { ApiError } from '@/lib/api';
import type { CustomerDuplicateMatch } from '@/app/actions/dashboard-customers';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/format';
import { EmptyState, ErrorState } from '@/components/feedback';
import { StatusBadge } from '@/components/console';
import { Pagination } from '@/components/console/Pagination';
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

/** `?lead={id}` (cible `lead`, TCK-590) : un entier positif, sinon rien n'est lu. */
function demandeDesignee(brut: string | null | undefined): number | null {
  if (!brut || !/^\d+$/.test(brut)) return null;
  const id = Number(brut);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

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
  // P97.04 (TCK-1120) — la cible `lead` promet « la boîte ouverte sur la demande » : la demande
  // désignée est rendue en tête, quel que soit l'onglet ou la page. Une lecture refusée ou
  // introuvable n'affiche rien de plus que la boîte.
  const searchParams = useSearchParams();
  const designee = useContactLead(demandeDesignee(searchParams?.get('lead')));
  const enTete = designee.isError ? null : (designee.data?.data ?? null);

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

      {enTete ? (
        <ul className="space-y-3">
          <DemandeDeContact key={enTete.id} lead={enTete} designee />
        </ul>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : query.isError || !query.data ? (
        <ErrorState message={t('error')} />
      ) : query.data.data.length === 0 && !enTete ? (
        <EmptyState
          icon={<Inbox className="size-8" aria-hidden="true" />}
          title={t(`empty.${filtre}`)}
          description={t('empty.description')}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {query.data.data
              .filter((lead) => lead.id !== enTete?.id)
              .map((lead) => (
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

/** TCK-1343 — les fiches existantes d'un 409 `customer.duplicate`, sinon `null`. */
function doublonsDe(e: unknown): CustomerDuplicateMatch[] | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const data = e.data as { code?: unknown; existing?: unknown } | null;
  if (!data || data.code !== 'customer.duplicate' || !Array.isArray(data.existing)) return null;
  return data.existing as CustomerDuplicateMatch[];
}

/** P182.03 (TCK-1824) — la fiche d'un 409 `lead.already_converted`, sinon `null`. */
function ficheDejaCreeeDe(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const data = e.data as { code?: unknown; customer?: { id?: unknown } | null } | null;
  if (!data || data.code !== 'lead.already_converted' || typeof data.customer?.id !== 'number') return null;
  return data.customer.id;
}

function nomComplet(u: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
}

function DemandeDeContact({ lead, designee = false }: { readonly lead: ContactLead; readonly designee?: boolean }) {
  const t = useTranslations('contactLeads');
  const tDoublon = useTranslations('agentCrm.form.duplicate');
  const locale = useLocale() as Locale;
  const toast = useToast();
  const { user } = useAuth();
  const handle = useHandleLead();
  const convert = useConvertLead();
  const [fichePosee, setFichePosee] = useState<number | null>(null);
  // P182.03 (TCK-1824) — la carte n'est pas remontée quand `lead` est relu (`key={lead.id}`) :
  // la fiche relue compte autant que celle que la conversion vient de poser.
  const customerId = fichePosee ?? lead.customer_id;
  const [attribuer, setAttribuer] = useState(false);
  // TCK-1343 — un doublon n'est pas une erreur mais une aide, comme dans `CustomerForm` : on
  // montre la fiche existante, et « Convertir quand même » renvoie avec `allow_duplicate`.
  const [doublons, setDoublons] = useState<CustomerDuplicateMatch[] | null>(null);

  const nom = lead.name?.trim() || t('anonymous');
  const telephone = lead.phone?.replace(/\D/g, '') ?? '';
  const reponse = lead.property
    ? t('whatsappReplyProperty', { name: nom, title: lead.property.title })
    : t('whatsappReply', { name: nom });
  // P152.05 — `PropertyContactLeadPolicy::assign` exige `crm.assign` dans l'agence de la
  // demande, sans branche d'admin : un admin dont le rôle ne la porte pas recevait 403.
  // P120.05 (TCK-1530) — et la capacité suffit : l'agent qui la détient lit les cibles par
  // `GET /agencies/{id}/members`, que l'API lui borne au personnel joignable, nom seul.
  const { can: peutAttribuer } = useCan('crm.assign', lead.agency_id ?? undefined, user !== null);

  async function marquerTraitee() {
    try {
      await handle.mutateAsync({ id: lead.id });
      toast.add({ title: t('toasts.handled'), type: 'success' });
    } catch {
      toast.add({ title: t('toasts.error'), type: 'error' });
    }
  }

  async function convertir(forcer = false) {
    try {
      const res = await convert.mutateAsync(forcer ? { id: lead.id, allow_duplicate: true } : { id: lead.id });
      setDoublons(null);
      setFichePosee(res.customer.id);
      toast.add({ title: t('toasts.converted'), type: 'success' });
    } catch (e) {
      // P182.03 (TCK-1824) — déjà convertie (réponse perdue, autre onglet, autre membre) : la
      // fiche existe, on la montre au lieu d'une erreur.
      const dejaCreee = ficheDejaCreeeDe(e);
      if (dejaCreee !== null) {
        setDoublons(null);
        setFichePosee(dejaCreee);
        return;
      }
      const trouves = doublonsDe(e);
      if (trouves) {
        setDoublons(trouves);
        return;
      }
      toast.add({ title: t('toasts.error'), type: 'error' });
    }
  }

  return (
    <li
      aria-current={designee ? 'true' : undefined}
      className={cn('space-y-3 rounded-xl border border-border bg-card p-4', designee && 'border-primary ring-2 ring-primary/30')}
    >
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

      {doublons && !customerId ? (
        <div role="status" className="space-y-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
          <p className="font-medium text-foreground">{tDoublon('title')}</p>
          <ul className="space-y-1">
            {doublons.map((d, i) => (
              <li key={d.id ?? `hidden-${i}`} className="flex flex-wrap items-center gap-x-2">
                <span>
                  {d.name ?? tDoublon('hidden')}
                  {' · '}
                  {tDoublon(`matchedOn.${d.matched_on}`)}
                </span>
                {d.id !== null ? (
                  <Link href={`/app/customers/${d.id}`} className="underline underline-offset-2">
                    {tDoublon('open')}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" onClick={() => void convertir(true)} disabled={convert.isPending}>
            {t('actions.convertAnyway')}
          </Button>
        </div>
      ) : null}

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
  // P120.01 (TCK-1246) — `filter[assignable]=1` ne garde que le personnel joignable de l'agence,
  // la règle de `PersonnelDeLAgence` qui juge la cible : sans lui, la liste offrait les bailleurs,
  // les comptes bloqués et les agents suspendus, refusés ensuite en 422.
  const membres = useApiQuery<PaginatedResponse<User>>(
    ['agency-members', agencyId, 'assign'],
    `/api/agencies/${agencyId}/members`,
    { params: { fields: { users: ['id', 'first_name', 'last_name'] }, filter: { assignable: 1 }, sort: 'first_name', per_page: 100 } },
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
