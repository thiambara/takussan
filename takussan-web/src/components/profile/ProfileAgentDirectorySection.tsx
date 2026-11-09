'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Loader2, RotateCw } from 'lucide-react';

import { FormError, FormGlobalError, FormSuccess } from '@/components/forms';
import { LANGUES_DE_L_ANNUAIRE } from '@/components/public/index/faits-de-profil';
import { Button, buttonVariants } from '@/components/ui/button';
import { Combobox, ComboboxMultiple, type OptionDeListe } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiMutation } from '@/hooks/useApiQuery';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { profilesKeys, useMyProfiles } from '@/hooks/useProfiles';
import {
  MAX_QUARTIERS,
  basculerLangue,
  erreursAnnuaireAgent,
  quartiersRetenus,
  type QuartierChoisi,
} from '@/lib/annuaire-agent';
import { useQuartiersDuReferentiel, useVillesDuReferentiel } from '@/lib/queries/referentiel-public';
import type { Profile } from '@/types/profile';

/**
 * TCK-2524 — « Sur votre fiche publique » : les langues que l'agent parle (cases d'une liste fermée)
 * et les quartiers qu'il couvre (référentiel, cinq au plus), écrits sur SON profil
 * (`PATCH /api/me/agent-profiles/{id}/directory`, réservé au compte qui le possède) et relus par
 * `GET /api/me/profiles`. Tout est facultatif : décocher tout retire la ligne de la fiche.
 *
 * Le profil écrit : le profil actif s'il est un profil d'agent, à défaut le premier — la même
 * règle que `ProfileAgentSection`, juste au-dessus.
 */

interface DirectoryResponse {
  readonly data: { readonly id: number; readonly languages: string[]; readonly neighborhood_ids: number[] };
}

interface DirectoryPayload {
  readonly languages: string[];
  readonly neighborhood_ids: number[];
}

function profilDAgent(profils: readonly Profile[], actif: string | null): Profile | undefined {
  const agents = profils.filter((p) => p.type === 'agent');
  return agents.find((p) => p.id === actif) ?? agents[0];
}

export function ProfileAgentDirectorySection() {
  const t = useTranslations('profile.agentDirectory');
  const profils = useMyProfiles();
  // Revue de TCK-2524 — la lecture des profils a ses deux états : la section ne disparaît jamais en
  // silence pendant qu'elle charge, ni quand elle échoue (l'agent ne saurait pas qu'elle existe).
  if (profils.isPending) {
    return (
      <Coque>
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">{t('loading')}</span>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Coque>
    );
  }
  if (profils.isError) {
    return (
      <Coque>
        <FormGlobalError>{t('loadError')}</FormGlobalError>
        <Button type="button" variant="outline" size="sm" onClick={() => void profils.refetch()} disabled={profils.isFetching}>
          <RotateCw aria-hidden="true" />
          {t('retry')}
        </Button>
      </Coque>
    );
  }
  const profil = profilDAgent(profils.data.data, profils.data.meta.active_profile_id);
  // Un compte sans profil d'agent n'a rien à dire à l'annuaire : la section n'a pas lieu d'être.
  if (!profil) return null;
  // `key` : un autre profil d'agent repart de SES valeurs, jamais de celles du précédent.
  return <FormulaireAnnuaire key={profil.id} profil={profil} />;
}

function Coque({ children, profil }: { readonly children: React.ReactNode; readonly profil?: Profile }) {
  const t = useTranslations('profile.agentDirectory');
  const idTitre = useId();
  const slug = profil?.public_slug ?? null;
  return (
    <section className="space-y-4 rounded-2xl bg-card p-6" aria-labelledby={idTitre} data-testid="profile-agent-directory">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={idTitre} className="text-lg font-bold text-foreground">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {/* Revue de TCK-2524 — comme pour l'agence : la puce mène à SA fiche, que l'API n'émet que si la
            page publique existe (`public_slug`, jamais celui d'un autre). */}
        {slug ? (
          <a
            href={`/agents/${encodeURIComponent(slug)}`}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <ExternalLink aria-hidden="true" />
            {t('viewPublic')}
          </a>
        ) : profil ? (
          <p className="text-xs text-muted-foreground">{t('notPublic')}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FormulaireAnnuaire({ profil }: { readonly profil: Profile }) {
  const t = useTranslations('profile.agentDirectory');
  const messageErreur = useMessageErreurApi();
  const idLangues = useId();
  const idVille = useId();
  const idQuartiers = useId();
  const [langues, setLangues] = useState<string[]>(() => [...(profil.languages ?? [])]);
  const [quartiers, setQuartiers] = useState<readonly QuartierChoisi[]>(() => [...(profil.neighborhoods ?? [])]);
  const [villeId, setVilleId] = useState<string | null>(null);
  const [refusPlein, setRefusPlein] = useState(false);
  const [erreurs, setErreurs] = useState<{ langues?: string; quartiers?: string }>({});
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  const villes = useVillesDuReferentiel();
  const referentielQuartiers = useQuartiersDuReferentiel(villeId === null ? null : Number(villeId));
  // Un quartier en attente de vérification ne se propose pas : la fiche publique ne montre que le référentiel.
  const optionsQuartiers: OptionDeListe[] = (referentielQuartiers.data?.data ?? [])
    .filter((q) => q.status === 'approved')
    .map((q) => ({ value: String(q.id), label: q.name }));

  const enregistrement = useApiMutation<DirectoryResponse, DirectoryPayload>(
    { path: `/api/me/agent-profiles/${profil.numeric_id}/directory`, method: 'PATCH' },
    {
      invalidate: [profilesKeys.all],
      onSuccess: () => {
        setErreurs({});
        setSucces(true);
      },
      onError: (erreur) => {
        const { langues: surLangues, quartiers: surQuartiers, autres } = erreursAnnuaireAgent(erreur.validationErrors);
        setErreurs({ langues: surLangues, quartiers: surQuartiers });
        setErreurGlobale(autres[0] ?? (surLangues || surQuartiers ? null : messageErreur(erreur)));
      },
    },
  );

  function modifie() {
    setSucces(false);
    setErreurGlobale(null);
  }

  function choisirQuartiers(choisies: OptionDeListe[]) {
    const proposes = choisies.map((o) => ({ id: Number(o.value), name: o.label }));
    const retenus = quartiersRetenus(quartiers, proposes);
    setRefusPlein(retenus === quartiers && proposes.length > MAX_QUARTIERS);
    if (retenus !== quartiers) {
      setQuartiers(retenus);
      setErreurs((e) => ({ ...e, quartiers: undefined }));
      modifie();
    }
  }

  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreurGlobale(null);
    setSucces(false);
    enregistrement.mutate({ languages: langues, neighborhood_ids: quartiers.map((q) => q.id) });
  }

  return (
    <Coque profil={profil}>
      <form onSubmit={enregistrer} noValidate className="space-y-5">
        {erreurGlobale ? <FormGlobalError>{erreurGlobale}</FormGlobalError> : null}
        {succes ? <FormSuccess>{t('saved')}</FormSuccess> : null}

        <fieldset className="min-w-0 space-y-2" aria-describedby={erreurs.langues ? `${idLangues}-erreur` : undefined}>
          <legend className="text-sm font-medium">{t('languages')}</legend>
          <p className="text-xs text-muted-foreground">{t('languagesHint')}</p>
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            {LANGUES_DE_L_ANNUAIRE.map((code) => (
              <label
                key={code}
                className="-mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring"
              >
                <input
                  type="checkbox"
                  className="size-4 flex-none accent-primary"
                  checked={langues.includes(code)}
                  onChange={() => {
                    setLangues((avant) => basculerLangue(avant, code, LANGUES_DE_L_ANNUAIRE));
                    setErreurs((e) => ({ ...e, langues: undefined }));
                    modifie();
                  }}
                />
                {t(`languageNames.${code}`)}
              </label>
            ))}
          </div>
          <FormError id={`${idLangues}-erreur`}>{erreurs.langues}</FormError>
        </fieldset>

        <fieldset className="min-w-0 space-y-2">
          <legend className="text-sm font-medium">
            {t('neighborhoods')}{' '}
            <span className="font-normal tabular-nums text-muted-foreground">
              {t('neighborhoodsCount', { n: quartiers.length, max: MAX_QUARTIERS })}
            </span>
          </legend>
          <p className="text-xs text-muted-foreground">{t('neighborhoodsHint')}</p>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="space-y-1">
              <Label htmlFor={idVille} className="text-xs text-muted-foreground">{t('city')}</Label>
              <Combobox
                id={idVille}
                options={(villes.data?.data ?? []).map((v) => ({ value: String(v.id), label: v.name }))}
                value={villeId}
                onChange={(option) => setVilleId(option?.value ?? null)}
                placeholder={t('cityPlaceholder')}
                aucunResultat={t('noCity')}
                chargement={villes.isLoading}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={idQuartiers} className="text-xs text-muted-foreground">{t('pickNeighborhoods')}</Label>
              <ComboboxMultiple
                id={idQuartiers}
                options={optionsQuartiers}
                valeurs={quartiers.map((q) => ({ value: String(q.id), label: q.name }))}
                onChange={choisirQuartiers}
                placeholder={villeId === null ? t('needCity') : t('neighborhoodsPlaceholder')}
                aucunResultat={t('noNeighborhood')}
                retirer={(nom) => t('remove', { name: nom })}
                chargement={villeId !== null && referentielQuartiers.isLoading}
                invalide={Boolean(erreurs.quartiers)}
                decritPar={erreurs.quartiers ? `${idQuartiers}-erreur` : undefined}
              />
            </div>
          </div>
          {refusPlein ? (
            <p className="text-xs font-medium text-destructive" role="alert">{t('full', { max: MAX_QUARTIERS })}</p>
          ) : null}
          <FormError id={`${idQuartiers}-erreur`}>{erreurs.quartiers}</FormError>
        </fieldset>

        <div className="flex justify-end">
          <Button type="submit" disabled={enregistrement.isPending}>
            {enregistrement.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t('save')}
          </Button>
        </div>
      </form>
    </Coque>
  );
}
