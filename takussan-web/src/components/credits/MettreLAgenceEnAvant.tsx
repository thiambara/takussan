'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Megaphone } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Combobox, type OptionDeListe } from '@/components/ui/combobox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  useAcheterMiseEnAvantAgence,
  useDevisMiseEnAvantAgence,
  useMiseEnAvantAgence,
  type DevisMiseEnAvantAgence,
  type PlaceDeLAgence,
  type ReglagesMiseEnAvantAgence,
} from '@/lib/queries/credits';
import { useVillesDuReferentiel } from '@/lib/queries/referentiel-public';

import { Carte } from './pieces';

/**
 * TCK-2525 (amendement du 2026-11-16 d'ADR-0061) — « Mettre l'agence en avant » : la place de
 * l'annuaire d'une ville, achetée avec les crédits de l'espace, à côté des mises en avant des biens.
 * Les places en cours et à venir, puis le dialogue d'achat : ville, jour de début, et — lus de l'API
 * avant toute confirmation — la période réelle, le prix et le solde après achat. Prix, durée, file
 * d'attente et horizon sont des réglages de la plateforme : l'écran les lit, il n'en écrit aucun.
 */

/** La valeur de l'option « tout l'annuaire » : une place sans ville. */
const SANS_VILLE = 'sans-ville';

/** `AAAA-MM-JJ` du jour, à Dakar (UTC, sans heure d'été), décalé de `jours`. */
function jourDakar(jours = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

function nouvelleCle(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function MettreLAgenceEnAvant({ className }: { readonly className?: string }) {
  const t = useTranslations('credits.agence');
  const f = useFormatteurs();
  const lecture = useMiseEnAvantAgence();
  const [ouvert, setOuvert] = useState(false);
  const [fait, setFait] = useState<string | null>(null);

  // Une lecture qui échoue ne casse pas la page du solde : la carte se tait.
  if (!lecture.data?.data?.settings) return null;
  const { settings, spotlights } = lecture.data.data;

  return (
    <Carte titre={t('titre')} aria-labelledby="credits-agence" className={className}>
      <div className="space-y-3 px-4 py-4">
        <p className="text-sm text-pretty text-muted-foreground">{t('texte')}</p>
        {spotlights.length === 0 ? (
          <EmptyState className="py-2" title={t('aucune')} />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {spotlights.map((p) => (
              <LigneDePlace key={p.id} place={p} />
            ))}
          </ul>
        )}
        {fait ? (
          <p role="status" className="text-sm text-success">
            {fait}
          </p>
        ) : null}
        {settings.sale_enabled ? (
          <>
            <p className="text-sm text-foreground tabular-nums">{t('prix', { price: settings.price_credits, days: settings.duration_days })}</p>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                setFait(null);
                setOuvert(true);
              }}
            >
              <Megaphone className="size-4" aria-hidden="true" /> {t('ouvrir')}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('venteFermee')}</p>
        )}
      </div>
      {ouvert ? (
        <DialogueDAchat
          reglages={settings}
          onFermer={() => setOuvert(false)}
          onFait={(place) =>
            setFait(t('fait', { city: place.city?.name ?? t('toutAnnuaire'), from: f.jourMois(place.starts_at), to: f.jourMois(place.ends_at) }))
          }
        />
      ) : null}
    </Carte>
  );
}

function LigneDePlace({ place }: { readonly place: PlaceDeLAgence }) {
  const t = useTranslations('credits.agence');
  const f = useFormatteurs();
  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{place.city?.name ?? t('toutAnnuaire')}</span>
      <span className="flex-none text-muted-foreground tabular-nums">{t('periode', { from: f.jourMois(place.starts_at), to: f.jourMois(place.ends_at) })}</span>
      {place.origin === 'offered' ? <span className="flex-none text-xs text-muted-foreground">{t('offerte')}</span> : null}
    </li>
  );
}

function DialogueDAchat({
  reglages,
  onFermer,
  onFait,
}: {
  readonly reglages: ReglagesMiseEnAvantAgence;
  readonly onFermer: () => void;
  readonly onFait: (place: PlaceDeLAgence) => void;
}) {
  const t = useTranslations('credits.agence.dialogue');
  const ta = useTranslations('credits.agence');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const [ville, setVille] = useState<string | null>(null);
  const [jour, setJour] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  // Une clé par ouverture du dialogue : un double clic rejoue l'achat, il n'en paie pas un second.
  const [cle] = useState(nouvelleCle);

  const villes = useVillesDuReferentiel();
  const options: OptionDeListe[] = [
    ...(reglages.sell_directory_wide ? [{ value: SANS_VILLE, label: ta('toutAnnuaire') }] : []),
    ...(villes.data?.data ?? []).map((v) => ({ value: String(v.id), label: v.name })),
  ];
  const villeId = ville === null || ville === SANS_VILLE ? null : Number(ville);
  const devis = useDevisMiseEnAvantAgence(villeId, jour, ville !== null);
  const acheter = useAcheterMiseEnAvantAgence(cle);

  const d = devis.data?.data;
  const soldeSuffisant = d !== undefined && d.balance_after >= 0;
  const possible = ville !== null && d !== undefined && d.available && soldeSuffisant && !acheter.isPending;

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onFermer())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('titre')}</DialogTitle>
          <DialogDescription>{t('description', { days: reglages.duration_days })}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!possible) return;
            setErreur(null);
            acheter.mutate(
              { geo_city_id: villeId, ...(jour ? { starts_on: jour } : {}) },
              {
                onSuccess: (reponse) => {
                  onFait(reponse.data);
                  onFermer();
                },
                onError: (err) => setErreur(messageErreur(err, t('echec'))),
              },
            );
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="agence-ville">{t('ville')}</Label>
            <Combobox
              id="agence-ville"
              options={options}
              value={ville}
              onChange={(option) => setVille(option?.value ?? null)}
              chargement={villes.isLoading}
              aucunResultat={t('aucuneVille')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="agence-debut">{t('debut')}</Label>
            <DatePicker id="agence-debut" value={jour} onValueChange={setJour} min={jourDakar()} max={jourDakar(reglages.max_advance_days)} />
            <p className="text-xs text-muted-foreground">{t('debutAide', { days: reglages.max_advance_days })}</p>
          </div>

          {ville !== null && d ? <Devis devis={d} jour={jour} onChoisirJour={setJour} fileDAttente={reglages.when_taken === 'next_free'} /> : null}
          {ville !== null && devis.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {messageErreur(devis.error, t('echec'))}
            </p>
          ) : null}
          {erreur ? (
            <p role="alert" className="text-sm text-destructive">
              {erreur}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onFermer}>
              {t('annuler')}
            </Button>
            <Button type="submit" disabled={!possible}>
              {t('confirmer', { count: reglages.price_credits })}
            </Button>
          </DialogFooter>
        </form>
        {/* Le résumé se relit après un changement de ville ou de jour : rien n'est payé sur un devis périmé. */}
        <span className="sr-only" aria-live="polite">
          {d?.available && d.starts_at ? t('periodeValeur', { from: f.jourMois(d.starts_at), to: f.jourMois(d.ends_at) }) : ''}
        </span>
      </DialogContent>
    </Dialog>
  );
}

function Devis({
  devis,
  jour,
  onChoisirJour,
  fileDAttente,
}: {
  readonly devis: DevisMiseEnAvantAgence;
  readonly jour: string;
  readonly onChoisirJour: (jour: string) => void;
  readonly fileDAttente: boolean;
}) {
  const t = useTranslations('credits.agence.dialogue');
  const f = useFormatteurs();

  if (!devis.available) {
    const prochain = devis.next_free_at;
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        <p>
          {devis.reason === 'too_far'
            ? t('tropLoin')
            : devis.reason === 'no_free_period'
              ? t('aucunCreneau')
              : prochain
                ? t('prise', { date: f.jourMois(prochain) })
                : t('priseSansDate')}
        </p>
        {devis.reason === 'taken' && prochain && prochain.slice(0, 10) !== jour ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onChoisirJour(prochain.slice(0, 10))}>
            {t('choisirJour', { date: f.jourMois(prochain) })}
          </Button>
        ) : null}
      </div>
    );
  }

  const decale = fileDAttente && devis.starts_at !== null && jour !== '' && devis.starts_at.slice(0, 10) !== jour;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm">
      <dt className="text-muted-foreground">{t('periode')}</dt>
      <dd className="text-right tabular-nums">{t('periodeValeur', { from: f.jourMois(devis.starts_at), to: f.jourMois(devis.ends_at) })}</dd>
      <dt className="text-muted-foreground">{t('prix')}</dt>
      <dd className="text-right tabular-nums">{t('credits', { count: devis.price_credits })}</dd>
      <dt className="text-muted-foreground">{t('soldeApres')}</dt>
      <dd className={devis.balance_after < 0 ? 'text-right text-destructive tabular-nums' : 'text-right tabular-nums'}>
        {t('credits', { count: devis.balance_after })}
      </dd>
      {decale ? <p className="col-span-2 pt-1 text-xs text-muted-foreground">{t('fileAttente')}</p> : null}
      {devis.balance_after < 0 ? (
        <p role="alert" className="col-span-2 pt-1 text-xs text-destructive">
          {t('soldeInsuffisant')}
        </p>
      ) : null}
    </dl>
  );
}
