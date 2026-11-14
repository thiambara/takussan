'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

import { BOUTON_D_ENTREE } from '@/components/auth/BoutonCollant';
import { TitreDEntree } from '@/components/auth/PiecesDuCourriel';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PuceDeFiltre } from '@/components/ui/puce-de-filtre';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { updateNotificationPreferences } from '@/lib/notification-preferences';
import {
  TRANCHES_DE_BUDGET,
  criteresDuChercheur,
  nomDeLAlerte,
  parametresDeLaListe,
  type TrancheDeBudget,
} from '@/lib/orientation';
import { useCreateSavedSearchMutation, useSavedSearchesQuery } from '@/lib/queries/saved-searches';
import { parametresDeRecherche } from '@/lib/recherche-publique';
import { cn, formatPrice } from '@/lib/utils';
import type { ContractType, SearchResult } from '@/types/search';

import { DeclarerBarreDOrientation } from './BarreDOrientation';

/** Les trois premiers résultats, à droite au bureau (maquette `ApercuResultats`). */
const APERCU = 3;

/**
 * La requête du compte et de l'aperçu : la liste qu'ouvrira « Voir les N biens », mêmes paramètres
 * (`parametresDeRecherche`, comme la page de liste), trois biens seulement et sans emplacement payé —
 * `meta.total` ne dépend ni de l'un ni de l'autre (AC2).
 */
export function requeteDuCompte(qsDeLaListe: string): string {
  const params = parametresDeRecherche(new URLSearchParams(qsDeLaListe));
  params.set('per_page', String(APERCU));
  params.set('placements', 'false');
  return `/public/properties/search?${params.toString()}`;
}

/**
 * TCK-2608 — la porte du chercheur : « Où et pour combien ? ». Quartiers et budget facultatifs ; le
 * compte est celui que l'API rend pour les mêmes critères ; l'alerte n'est créée qu'au geste « Voir
 * les N biens » (jamais au toucher d'une pastille), puis la liste filtrée s'ouvre. « Passer » mène à
 * la liste sans rien créer.
 */
export function EtapeChercheur({
  marque,
  quartiersSuggeres,
  whatsapp,
  onRetour,
}: {
  readonly marque: string;
  readonly quartiersSuggeres: readonly string[];
  /** Le numéro (masqué) où WhatsApp préviendrait ; `null` : capacité fermée ou canal verrouillé — pas d'interrupteur. */
  readonly whatsapp: { readonly numero: string } | null;
  readonly onRetour: () => void;
}) {
  const t = useTranslations('onboarding.orientation.chercheur');
  const tO = useTranslations('onboarding.orientation');
  const router = useRouter();
  const { token } = useAuth();
  const id = useId();
  const [contrat, setContrat] = useState<ContractType>('rent');
  const [quartiers, setQuartiers] = useState<readonly string[]>([]);
  const [ajoutes, setAjoutes] = useState<readonly string[]>([]);
  const [saisieAutre, setSaisieAutre] = useState<string | null>(null);
  const champAutre = useRef<HTMLInputElement>(null);
  const autreOuvert = saisieAutre !== null;
  // « Autre » touché : le champ s'ouvre et prend la main (le geste vient d'être fait, rien n'est volé).
  useEffect(() => {
    if (autreOuvert) champAutre.current?.focus();
  }, [autreOuvert]);
  const [budget, setBudget] = useState<TrancheDeBudget | null>(null);
  const [alerteWhatsapp, setAlerteWhatsapp] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const criteres = criteresDuChercheur({ contrat, quartiers, budget });
  const qs = parametresDeLaListe(criteres);
  const compte = useQuery({
    queryKey: ['orientation', 'chercheur', qs],
    queryFn: () => apiFetch<SearchResult>(requeteDuCompte(qs)),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
  const total = compte.data && !compte.isPlaceholderData ? compte.data.meta.total : null;
  const existantes = useSavedSearchesQuery();
  const creer = useCreateSavedSearchMutation();

  const suggestions = [...quartiersSuggeres, ...ajoutes.filter((q) => !quartiersSuggeres.includes(q))];
  const libelleDeTranche = budget && contrat === 'rent' ? t(`tranches.${budget}`) : null;

  function basculerQuartier(q: string) {
    setQuartiers((avant) => (avant.includes(q) ? avant.filter((x) => x !== q) : [...avant, q]));
  }

  function ajouterAutre(evenement: FormEvent) {
    evenement.preventDefault();
    const q = (saisieAutre ?? '').trim();
    if (q === '') return;
    if (!suggestions.includes(q)) setAjoutes((avant) => [...avant, q]);
    setQuartiers((avant) => (avant.includes(q) ? avant : [...avant, q]));
    setSaisieAutre(null);
  }

  async function voirLesBiens() {
    setErreur(null);
    setEnCours(true);
    try {
      const nom = nomDeLAlerte(
        criteres,
        libelleDeTranche,
        { louer: t('nom.louer'), acheter: t('nom.acheter'), partout: t('nom.partout'), budget: (tranche) => t('nom.budget', { tranche }) },
        (existantes.data?.data ?? []).map((s) => s.name),
      );
      await creer.mutateAsync({ name: nom, criteria: { ...criteres }, notification_frequency: 'daily' });
      if (whatsapp && token) {
        // Le canal de l'alerte, tel que l'interrupteur le dit : écrit au geste, jamais au basculement.
        await updateNotificationPreferences(token, [{ event_type: 'saved_search_match', channel: 'whatsapp', enabled: alerteWhatsapp }]).catch(() => null);
      }
      router.push(`/properties?${qs}`);
    } catch {
      setErreur(t('erreurAlerte'));
      setEnCours(false);
    }
  }

  const libelleDuBouton = total === null ? t('voirSansCompte') : t('voir', { n: total });
  const bouton = (className?: string) => (
    <Button type="button" onClick={() => void voirLesBiens()} disabled={enCours} aria-busy={enCours || undefined} className={cn(BOUTON_D_ENTREE, 'tabular-nums', className)}>
      {libelleDuBouton}
    </Button>
  );

  const resultats = compte.data?.data.slice(0, APERCU) ?? [];
  const apercu = (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="font-display text-[1.375rem] font-semibold leading-tight tracking-titre">
        {total === null ? t('voirSansCompte') : t('correspondent', { n: total })}
      </p>
      <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
        {[contrat === 'rent' ? t('aLouer') : t('aAcheter'), quartiers.length > 0 ? quartiers.join(', ') : null, libelleDeTranche ? t('nom.budget', { tranche: libelleDeTranche }) : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {resultats.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {resultats.map((r) => (
            <li key={r.id} className="flex items-center gap-3.5 py-3">
              <span className="h-[4.25rem] w-[5.75rem] flex-none overflow-hidden rounded-lg bg-muted">
                {r.main_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vignette de 92 px, servie telle quelle par l'API
                  <img src={r.main_photo_url} alt="" className="size-full object-cover" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1 leading-snug">
                <span className="block truncate text-corps font-semibold">{r.title}</span>
                <span className="mt-0.5 block text-ui text-muted-foreground">
                  {[r.location.quarter, r.area ? `${r.area} m²` : null].filter(Boolean).join(' · ')}
                </span>
                <span className="mt-1 block text-sm font-semibold tabular-nums">
                  {formatPrice(r.price)} {r.rent_period === 'monthly' ? <span className="font-normal text-muted-foreground">{t('parMois')}</span> : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {total !== null ? <p className="mt-3.5 text-ui text-muted-foreground">{t('autres', { n: Math.max(0, total - resultats.length) })}</p> : null}
    </div>
  );

  return (
    <div>
      <DeclarerBarreDOrientation
        marque={marque}
        titre={t('barre')}
        largeur="volets"
        objet={apercu}
        retour={{ libelle: tO('retour'), onClick: onRetour }}
        action={{ libelle: tO('passer'), onClick: () => router.push('/properties'), desactivee: enCours }}
        pied={<div className="lg:hidden">{bouton()}</div>}
      />
      <TitreDEntree sous={t('sous')}>{t('titre')}</TitreDEntree>

      <div className="mt-6 lg:mt-8">
        <div role="radiogroup" aria-label={t('contrat')} className="flex rounded-full bg-muted p-1 lg:w-[17.5rem]">
          {(['rent', 'sale'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={contrat === c}
              onClick={() => setContrat(c)}
              className={cn(
                'inline-flex h-10 flex-1 items-center justify-center rounded-full text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
                contrat === c ? 'bg-card text-foreground shadow-actif' : 'text-muted-foreground',
              )}
            >
              {c === 'rent' ? t('louer') : t('acheter')}
            </button>
          ))}
        </div>

        <div className="mt-7 flex items-baseline justify-between gap-3">
          <h2 id={`${id}-quartiers`} className="text-corps font-semibold">{t('quartiers')}</h2>
          <span className="text-ui text-muted-foreground">{t('choisis', { n: quartiers.length })}</span>
        </div>
        <div role="group" aria-labelledby={`${id}-quartiers`} className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((q) => {
            const actif = quartiers.includes(q);
            return (
              <PuceDeFiltre key={q} type="button" active={actif} onClick={() => basculerQuartier(q)} className="h-11 px-4 text-corps">
                {actif ? <Check className="size-4 flex-none" strokeWidth={2.25} aria-hidden="true" /> : null}
                {q}
              </PuceDeFiltre>
            );
          })}
          {saisieAutre === null ? (
            <PuceDeFiltre type="button" variante="ajouter" onClick={() => setSaisieAutre('')} className="h-11 px-4 text-corps">
              {/* La variante `ajouter` pose elle-même son « + » et son bord en tirets. */}
              {t('autre')}
            </PuceDeFiltre>
          ) : null}
        </div>
        {saisieAutre !== null ? (
          <form onSubmit={ajouterAutre} className="mt-3 flex gap-2">
            <Input
              ref={champAutre}
              aria-label={t('autreLibelle')}
              placeholder={t('autreLibelle')}
              maxLength={100}
              value={saisieAutre}
              onChange={(e) => setSaisieAutre(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" variant="outline" className="h-11 rounded-full px-5">
              {t('ajouter')}
            </Button>
          </form>
        ) : null}

        {contrat === 'rent' ? (
          <>
            <div className="mt-7 flex items-baseline justify-between gap-3">
              <h2 id={`${id}-budget`} className="text-corps font-semibold">{t('budget')}</h2>
              <span className="text-ui text-muted-foreground">{t('enCfa')}</span>
            </div>
            <div role="group" aria-labelledby={`${id}-budget`} className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {TRANCHES_DE_BUDGET.map((b) => (
                <PuceDeFiltre
                  key={b.id}
                  type="button"
                  active={budget === b.id}
                  onClick={() => setBudget((avant) => (avant === b.id ? null : b.id))}
                  className="h-11 justify-center px-2 text-corps tabular-nums lg:text-sm"
                >
                  {t(`tranches.${b.id}`)}
                </PuceDeFiltre>
              ))}
            </div>
          </>
        ) : null}

        {whatsapp ? (
          <label className="mt-7 flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
            <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-success/15 text-success">
              <IconeWhatsApp className="size-5" />
            </span>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block text-corps font-medium">{t('whatsapp')}</span>
              <span className="mt-0.5 block text-ui text-muted-foreground">{t('whatsappAide', { numero: whatsapp.numero })}</span>
            </span>
            <Switch checked={alerteWhatsapp} onCheckedChange={setAlerteWhatsapp} className="h-7 w-12 [&>[data-slot=switch-thumb]]:size-6 [&>[data-slot=switch-thumb]]:data-checked:translate-x-5" />
          </label>
        ) : null}

        {erreur ? (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {erreur}
          </p>
        ) : null}

        {bouton('mt-8 hidden w-auto min-w-[16.25rem] lg:inline-flex')}
      </div>
    </div>
  );
}
