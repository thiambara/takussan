'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { DataState } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Combobox, type OptionDeListe } from '@/components/ui/combobox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useVillesDuReferentiel } from '@/lib/queries/referentiel-public';
import {
  createAgencySpotlight,
  deleteAgencySpotlight,
  fetchAgencySpotlights,
  searchActiveAgencies,
  type AgencyChoice,
  type AgencySpotlight,
  type AgencySpotlightWhen,
} from './api';

const PERIODES: readonly AgencySpotlightWhen[] = ['', 'current', 'upcoming', 'past'];
/** La valeur de l'option « tout l'annuaire » : une place sans ville. */
const SANS_VILLE = 'sans-ville';

/** `YYYY-MM-DD` → minuit de ce jour, à l'heure de Dakar (UTC, sans heure d'été). */
function minuit(jour: string): string {
  return `${jour}T00:00:00Z`;
}

/** Le lendemain d'un `YYYY-MM-DD` : la fin d'une période saisie « du … au … » inclus est exclue côté API. */
function lendemain(jour: string): string {
  const date = new Date(`${jour}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** La veille d'un instant ISO, en `YYYY-MM-DD` : le dernier jour couvert d'une fin exclue. */
function dernierJour(instant: string): string {
  const date = new Date(instant);
  date.setUTCMilliseconds(date.getUTCMilliseconds() - 1);
  return date.toISOString();
}

function etatDe(place: AgencySpotlight, maintenant: number): 'current' | 'upcoming' | 'past' {
  if (new Date(place.starts_at).getTime() > maintenant) return 'upcoming';
  if (new Date(place.ends_at).getTime() <= maintenant) return 'past';
  return 'current';
}

/**
 * TCK-2520 (ADR-0092) — la place « Mise en avant » de l'annuaire des agences : une agence en tête de
 * l'annuaire d'une ville, pendant une période, offerte par la plateforme. Une seule par ville et par
 * instant : un chevauchement revient en 422, dont le message est affiché tel quel.
 */
export function AdminAgencySpotlights() {
  const t = useTranslations('superAdmin.miseEnAvantAgences');
  const f = useFormatteurs();
  const garde = useGardeDoubleFacteur();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [quand, setQuand] = useState<AgencySpotlightWhen>('');
  const [page, setPage] = useState(1);
  const [saisieAgence, setSaisieAgence] = useState('');
  const [recherche, setRecherche] = useState('');
  const [agence, setAgence] = useState<AgencyChoice | null>(null);
  const [ville, setVille] = useState<string | null>(null);
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [motif, setMotif] = useState('');
  const [retour, setRetour] = useState<{ readonly ok: boolean; readonly texte: string } | null>(null);
  const [aRetirer, setARetirer] = useState<AgencySpotlight | null>(null);
  const [erreurRetrait, setErreurRetrait] = useState<string | null>(null);
  const [maintenant] = useState(() => Date.now());

  const places = useQuery({ queryKey: ['super-admin', 'agency-spotlights', quand, page], queryFn: () => fetchAgencySpotlights({ when: quand, page }) });
  const agences = useQuery({
    queryKey: ['super-admin', 'agency-spotlights', 'agences', recherche],
    queryFn: () => searchActiveAgencies(recherche),
    enabled: recherche !== '',
  });
  const villes = useVillesDuReferentiel();
  const optionsVille: OptionDeListe[] = [
    { value: SANS_VILLE, label: t('form.anyCity') },
    ...(villes.data?.data ?? []).map((v) => ({ value: String(v.id), label: v.name })),
  ];

  const offrir = useMutation({
    mutationFn: () =>
      avecGardeDoubleFacteur(
        () =>
          createAgencySpotlight({
            agency_id: agence?.id ?? 0,
            geo_city_id: ville === null || ville === SANS_VILLE ? null : Number(ville),
            starts_at: minuit(du),
            ends_at: minuit(lendemain(au)),
            note: motif.trim(),
          }),
        garde,
      ),
    onSuccess: () => {
      setAgence(null);
      setVille(null);
      setDu('');
      setAu('');
      setMotif('');
      setRetour({ ok: true, texte: t('form.done') });
      return queryClient.invalidateQueries({ queryKey: ['super-admin', 'agency-spotlights'] });
    },
    onError: (err) => setRetour({ ok: false, texte: messageErreur(err, t('form.failed')) }),
  });

  const retirer = useMutation({
    mutationFn: (id: number) => avecGardeDoubleFacteur(() => deleteAgencySpotlight(id), garde),
    onSuccess: () => {
      setARetirer(null);
      return queryClient.invalidateQueries({ queryKey: ['super-admin', 'agency-spotlights'] });
    },
    onError: (err) => setErreurRetrait(messageErreur(err, t('revoke.failed'))),
  });

  const colonnes: DataTableColumn<AgencySpotlight>[] = [
    { id: 'agency', header: t('colAgency'), className: 'font-medium text-foreground', cell: (p) => p.agency?.name ?? `#${p.agency_id}` },
    { id: 'city', header: t('colCity'), cell: (p) => p.city?.name ?? t('form.anyCity') },
    {
      id: 'period',
      header: t('colPeriod'),
      cell: (p) => <span className="tabular-nums">{t('period', { from: f.date(p.starts_at), to: f.date(dernierJour(p.ends_at)) })}</span>,
    },
    { id: 'state', header: t('colState'), cell: (p) => t(`when.${etatDe(p, maintenant)}`) },
    { id: 'note', header: t('colNote'), cell: (p) => p.note ?? '—' },
    { id: 'by', header: t('colGrantedBy'), cell: (p) => p.granted_by?.name ?? '—' },
    {
      id: 'actions',
      header: t('colActions'),
      headerSrOnly: true,
      align: 'end',
      cell: (p) =>
        etatDe(p, maintenant) === 'past' ? null : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setErreurRetrait(null);
              setARetirer(p);
            }}
          >
            {t('revoke.open')}
          </Button>
        ),
    },
  ];

  const periodeValide = du !== '' && au !== '' && au >= du;
  const formulaireValide = agence !== null && ville !== null && periodeValide && motif.trim().length >= 5;

  return (
    <div className="space-y-8">
      <p className="max-w-prose text-sm text-muted-foreground">{t('intro')}</p>

      <div role="group" aria-label={t('whenFilter')} className="flex flex-wrap gap-2">
        {PERIODES.map((p) => (
          <Button
            key={p || 'all'}
            type="button"
            size="sm"
            variant={p === quand ? 'default' : 'outline'}
            aria-pressed={p === quand}
            onClick={() => {
              setQuand(p);
              setPage(1);
            }}
          >
            {t(`when.${p || 'all'}`)}
          </Button>
        ))}
      </div>

      <DataState
        loading={places.isLoading}
        error={places.isError ? t('loadError') : null}
        onRetry={() => void places.refetch()}
        retryLabel={t('retry')}
        isEmpty={(places.data?.data.length ?? 0) === 0}
        emptyState={<EmptyState title={t('empty')} />}
      >
        <DataTable caption={t('caption')} columns={colonnes} rows={places.data?.data ?? []} rowKey={(p) => p.id} />
        <Pagination page={places.data?.meta.current_page ?? 1} lastPage={places.data?.meta.last_page ?? 1} onChange={setPage} />
      </DataState>

      <section aria-labelledby="offrir-place" className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 id="offrir-place" className="font-medium text-foreground">{t('form.title')}</h2>

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setRecherche(saisieAgence.trim());
          }}
        >
          <div className="min-w-0 flex-1 space-y-1 sm:max-w-sm">
            <Label htmlFor="place-agence">{t('form.agency')}</Label>
            <Input id="place-agence" value={saisieAgence} onChange={(e) => setSaisieAgence(e.target.value)} placeholder={t('form.agencyPlaceholder')} />
          </div>
          <Button type="submit" variant="outline">{t('form.search')}</Button>
        </form>
        {recherche !== '' ? (
          <div role="group" aria-label={t('form.agencyResults')} className="flex flex-wrap gap-2">
            {agences.isLoading ? <p className="text-sm text-muted-foreground">{t('form.searching')}</p> : null}
            {agences.isSuccess && agences.data.data.length === 0 ? <p className="text-sm text-muted-foreground">{t('form.noAgency')}</p> : null}
            {(agences.data?.data ?? []).map((a) => (
              <Button
                key={a.id}
                type="button"
                size="sm"
                variant={agence?.id === a.id ? 'default' : 'outline'}
                aria-pressed={agence?.id === a.id}
                onClick={() => setAgence({ id: a.id, name: a.name })}
              >
                {a.name}
              </Button>
            ))}
          </div>
        ) : null}

        <form
          className="grid gap-3 sm:grid-cols-3 sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            if (formulaireValide) offrir.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="place-ville">{t('form.city')}</Label>
            <Combobox
              id="place-ville"
              options={optionsVille}
              value={ville}
              onChange={(option) => setVille(option?.value ?? null)}
              chargement={villes.isLoading}
              aucunResultat={t('form.noCity')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="place-du">{t('form.from')}</Label>
            <DatePicker id="place-du" value={du} onValueChange={setDu} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="place-au">{t('form.to')}</Label>
            <DatePicker id="place-au" value={au} onValueChange={setAu} min={du || undefined} />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="place-motif">{t('form.reason')}</Label>
            <Textarea id="place-motif" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-3">
            <p className="text-sm text-muted-foreground">
              {agence ? t('form.summary', { agency: agence.name }) : t('form.pickAgency')}
            </p>
            <Button type="submit" disabled={!formulaireValide || offrir.isPending}>{t('form.submit')}</Button>
          </div>
        </form>
        {retour ? (
          <p role={retour.ok ? 'status' : 'alert'} className={retour.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{retour.texte}</p>
        ) : null}
      </section>

      <Dialog open={aRetirer !== null} onOpenChange={(ouvert) => (ouvert ? null : setARetirer(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('revoke.title')}</DialogTitle>
            <DialogDescription>{aRetirer?.agency?.name ?? ''}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('revoke.body')}</p>
          {erreurRetrait ? <p role="alert" className="text-sm text-destructive">{erreurRetrait}</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setARetirer(null)}>{t('revoke.back')}</Button>
            <Button variant="destructive" disabled={retirer.isPending} onClick={() => aRetirer && retirer.mutate(aRetirer.id)}>
              {t('revoke.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
