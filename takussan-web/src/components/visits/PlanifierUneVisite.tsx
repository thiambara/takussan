'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarPlus } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useMyProfiles } from '@/hooks/useProfiles';
import { usePlanVisit } from '@/lib/queries/visits';
import { instantADakar } from '@/lib/visites/heure-de-dakar';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useToast } from '@/components/ui/toast';
import type { PaginatedResponse } from '@/types/api';

/** La grille des visites, à Dakar — la même que celle du serveur (`VisitSchedulingService`). */
const HEURES: readonly string[] = Array.from({ length: 20 }, (_, i) => {
  const minutes = 9 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

interface Choix {
  readonly id: number;
  readonly libelle: string;
}

interface PlanifierUneVisiteProps {
  /** Depuis la fiche bien : le bien est fixé. */
  readonly property?: Choix;
  /** Depuis la fiche client : le client est fixé. */
  readonly customer?: Choix;
  /**
   * L'agence du bien, quand on la connaît (fiche bien). `null` : bien sans agence, qui n'a aucun
   * personnel. Omise : l'agence du profil actif (fiche client, calendrier).
   */
  readonly agencyId?: number | null;
}

const PROFILS_DU_PERSONNEL: ReadonlySet<string> = new Set(['agent', 'agency_admin']);

/**
 * Le profil ACTIF est-il du personnel actif de l'agence visée ? Le pendant, côté affichage, de
 * `PersonnelDeLAgence::estPersonnel()` : un profil agent ou admin, au statut `active`, dans
 * l'agence du bien. Ce n'est qu'une politesse — l'API décide.
 */
function usePersonnelActif(agencyId: number | null | undefined): boolean {
  const { data } = useMyProfiles();
  const actif = data?.data.find((p) => p.id === data.meta.active_profile_id);
  if (!actif || !PROFILS_DU_PERSONNEL.has(actif.type) || actif.status !== 'active') return false;
  if (agencyId === undefined) return actif.agency_id !== null;
  return agencyId !== null && actif.agency_id === agencyId;
}

/**
 * TCK-590 — « Planifier une visite » depuis la fiche bien, la fiche client et le calendrier.
 *
 * L'API n'offrait au personnel aucune création qui ait un sens : `POST /property-visits` posait
 * `visitor_id = l'appelant`, et l'agent qui planifiait pour le prospect qui venait d'appeler
 * devenait lui-même le visiteur. La visite naît désormais CONFIRMÉE et le client est prévenu ;
 * sans fiche client, le prospect se donne par nom + téléphone.
 *
 * Réservé au PERSONNEL (agent, admin) : l'API ne laisse planifier pour un tiers que le personnel
 * actif de l'agence du bien (vérification adverse, B1/B2). Un bailleur qui l'ouvrirait réserverait
 * pour lui-même sans le savoir — le bouton ne lui est pas montré.
 *
 * Passe 2 (n4) — la garde lisait les rôles GLOBAUX (`isAgent(user.roles)`) : un agent SUSPENDU,
 * ou dont le profil actif est celui d'une autre agence, voyait le bouton, et l'API, qui le traite
 * en non-personnel, le faisait réserver pour lui-même. Elle lit désormais le profil actif.
 */
export function PlanifierUneVisite({ property, customer, agencyId }: PlanifierUneVisiteProps) {
  const t = useTranslations('visitPlanning.plan');
  const personnel = usePersonnelActif(agencyId);
  const [ouvert, setOuvert] = useState(false);
  if (!personnel) return null;
  return (
    <>
      <Button type="button" variant="outline" className="h-10 gap-2 sm:h-8" onClick={() => setOuvert(true)}>
        <CalendarPlus className="size-4" aria-hidden />
        {t('cta')}
      </Button>
      {ouvert ? (
        <PlanifierDialog property={property} customer={customer} onClose={() => setOuvert(false)} />
      ) : null}
    </>
  );
}

function useRecherche<T>(chemin: string, table: string, champs: string[], terme: string, actif: boolean) {
  return useApiQuery<PaginatedResponse<T>>(
    [chemin, 'planifier', terme],
    chemin,
    {
      params: {
        fields: { [table]: champs },
        filter: terme ? { search: terme } : {},
        per_page: 20,
      },
      enabled: actif,
    },
  );
}

function PlanifierDialog({
  property,
  customer,
  onClose,
}: PlanifierUneVisiteProps & { readonly onClose: () => void }) {
  const t = useTranslations('visitPlanning.plan');
  const toast = useToast();
  const plan = usePlanVisit();

  const [propertyId, setPropertyId] = useState<number | null>(property?.id ?? null);
  const [customerId, setCustomerId] = useState<number | null>(customer?.id ?? null);
  const [rechercheBien, setRechercheBien] = useState('');
  const [rechercheClient, setRechercheClient] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [jour, setJour] = useState('');
  const [heure, setHeure] = useState('10:00');
  const [erreur, setErreur] = useState<string | null>(null);

  const biens = useRecherche<{ id: number; title: string }>(
    '/api/properties',
    'properties',
    ['id', 'title'],
    rechercheBien,
    !property,
  );
  const clients = useRecherche<{ id: number; first_name: string | null; last_name: string | null }>(
    '/api/customers',
    'customers',
    ['id', 'first_name', 'last_name'],
    rechercheClient,
    !customer,
  );

  const prospect = customerId === null;
  const complet =
    propertyId !== null && jour !== '' && heure !== '' && (!prospect || (name.trim() !== '' && phone !== ''));

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!complet || propertyId === null) {
      setErreur(t('required'));
      return;
    }
    setErreur(null);
    try {
      await plan.mutateAsync({
        property_id: propertyId,
        scheduled_at: instantADakar(jour, heure),
        ...(prospect ? { visitor_name: name.trim(), visitor_phone: phone } : { customer_id: customerId }),
      });
      toast.add({ title: t('success'), type: 'success' });
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? (err.data as { message?: string } | null)?.message : undefined;
      setErreur(message ?? t('required'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void valider(e)} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="plan-property" className="block text-sm font-medium text-foreground">
              {t('property')}
            </label>
            {property ? (
              <p id="plan-property" className="text-sm text-foreground">{property.libelle}</p>
            ) : (
              <>
                <Input
                  value={rechercheBien}
                  onChange={(e) => setRechercheBien(e.target.value)}
                  placeholder={t('propertyPlaceholder')}
                  aria-label={t('propertyPlaceholder')}
                />
                <select
                  id="plan-property"
                  value={propertyId ?? ''}
                  onChange={(e) => setPropertyId(e.target.value ? Number(e.target.value) : null)}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="">—</option>
                  {(biens.data?.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="plan-customer" className="block text-sm font-medium text-foreground">
              {t('customer')}
            </label>
            {customer ? (
              <p id="plan-customer" className="text-sm text-foreground">{customer.libelle}</p>
            ) : (
              <>
                <Input
                  value={rechercheClient}
                  onChange={(e) => setRechercheClient(e.target.value)}
                  placeholder={t('customerPlaceholder')}
                  aria-label={t('customerPlaceholder')}
                />
                <select
                  id="plan-customer"
                  value={customerId ?? ''}
                  onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="">{t('noCustomer')}</option>
                  {(clients.data?.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {prospect && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="plan-name" className="block text-sm font-medium text-foreground">
                  {t('name')}
                </label>
                <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="plan-phone" className="block text-sm font-medium text-foreground">
                  {t('phone')}
                </label>
                <PhoneInput id="plan-phone" value={phone} onValueChange={setPhone} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="plan-date" className="block text-sm font-medium text-foreground">
                {t('date')}
              </label>
              <Input id="plan-date" type="date" value={jour} onChange={(e) => setJour(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="plan-time" className="block text-sm font-medium text-foreground">
                {t('time')} <span className="font-normal text-muted-foreground">({t('dakarTime')})</span>
              </label>
              <select
                id="plan-time"
                value={heure}
                onChange={(e) => setHeure(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm tabular-nums text-foreground"
              >
                {HEURES.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {erreur ? (
            <p role="alert" className="text-sm text-destructive">
              {erreur}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={plan.isPending}>
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
