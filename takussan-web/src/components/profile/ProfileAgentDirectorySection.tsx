'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, ExternalLink, Loader2, RotateCw } from 'lucide-react';

import { FormError, FormGlobalError, FormSuccess } from '@/components/forms';
import { LANGUES_DE_L_ANNUAIRE } from '@/components/public/index/faits-de-profil';
import { Button } from '@/components/ui/button';
import { PiedDEnregistrement } from '@/components/profile/sommaire/PiedDEnregistrement';
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
  // TCK-2635 — à nu sous le titre de la section « Fiche publique » (maquette `FormFiche`) : le titre
  // de la carte d'avant reste pour l'assistance, il ne se répète plus à l'écran.
  return (
    <section className="space-y-6" aria-labelledby={idTitre} data-testid="profile-agent-directory">
      <h2 id={idTitre} className="sr-only">{t('title')}</h2>
      {/* Revue de TCK-2524 — comme pour l'agence : le lien mène à SA fiche, que l'API n'émet que si la
          page publique existe (`public_slug`, jamais celui d'un autre). */}
      {slug ? (
        <a
          href={`/agents/${encodeURIComponent(slug)}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          {t('viewPublic')}
        </a>
      ) : profil ? (
        <p className="text-xs text-muted-foreground">{t('notPublic')}</p>
      ) : null}
      {children}
    </section>
  );
}

function FormulaireAnnuaire({ profil }: { readonly profil: Profile }) {
  const t = useTranslations('profile.agentDirectory');
  const messageErreur = useMessageErreurApi();
  const router = useRouter();
  const idLangues = useId();
  const idVille = useId();
  const idQuartiers = useId();
  const idFormulaire = useId();
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
        // TCK-2635 — le point « Fiche publique » et le compte de « À régler » se lisent au rendu
        // serveur du cadre du profil : une fiche complétée les éteint sans recharger la page.
        router.refresh();
      },
      onError: (erreur) => {
        const { langues: surLangues, quartiers: surQuartiers, autres } = erreursAnnuaireAgent(erreur.validationErrors);
        setErreurs({ langues: surLangues, quartiers: surQuartiers });
        setErreurGlobale(autres[0] ?? (surLangues || surQuartiers ? null : messageErreur(erreur)));
      },
    },
  );

  // TCK-2635 — « Enregistrer » n'est actif que sur une modification ; l'ordre des langues ou des
  // quartiers choisis n'en est pas une. Après l'enregistrement, le profil relu rejoint la saisie.
  const memes = (a: readonly (string | number)[], b: readonly (string | number)[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const languesModifiees = !memes(langues, profil.languages ?? []);
  const quartiersModifies = !memes(
    quartiers.map((q) => q.id),
    (profil.neighborhoods ?? []).map((q) => q.id),
  );
  const modifications = Number(languesModifiees) + Number(quartiersModifies);

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
      <form id={idFormulaire} onSubmit={enregistrer} noValidate className="space-y-6">
        {erreurGlobale ? <FormGlobalError>{erreurGlobale}</FormGlobalError> : null}
        {succes ? <FormSuccess>{t('saved')}</FormSuccess> : null}

        <fieldset className="min-w-0" aria-describedby={erreurs.langues ? `${idLangues}-erreur` : undefined}>
          <legend className="text-corps font-semibold">{t('languages')}</legend>
          <p className="mb-2 text-ui text-muted-foreground">{t('languagesHint')}</p>
          {/* TCK-2635 — des puces à cocher (maquette `PuceChoix`) : la case reste, pour le clavier et
              l'assistance ; la puce est son libellé. */}
          <div className="flex flex-wrap gap-2">
            {LANGUES_DE_L_ANNUAIRE.map((code) => {
              const cochee = langues.includes(code);
              return (
                <label
                  key={code}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:ring-3 has-focus-visible:ring-ring"
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={cochee}
                    onChange={() => {
                      setLangues((avant) => basculerLangue(avant, code, LANGUES_DE_L_ANNUAIRE));
                      setErreurs((e) => ({ ...e, langues: undefined }));
                      modifie();
                    }}
                  />
                  {cochee ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  {t(`languageNames.${code}`)}
                </label>
              );
            })}
          </div>
          <FormError id={`${idLangues}-erreur`}>{erreurs.langues}</FormError>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="sr-only">
            {t('neighborhoods')} {t('neighborhoodsCount', { n: quartiers.length, max: MAX_QUARTIERS })}
          </legend>
          <div className="mb-2 flex items-end gap-3" aria-hidden="true">
            <div className="min-w-0 flex-1">
              <p className="text-corps font-semibold">{t('neighborhoods')}</p>
              <p className="text-ui text-muted-foreground">{t('neighborhoodsHint')}</p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
              {t('neighborhoodsCount', { n: quartiers.length, max: MAX_QUARTIERS })}
            </span>
          </div>
          <div className="grid gap-3">
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

        <PiedDEnregistrement
          modifications={modifications}
          bouton={
            <Button type="submit" form={idFormulaire} disabled={enregistrement.isPending || modifications === 0}>
              {enregistrement.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {t('save')}
            </Button>
          }
        />
      </form>
    </Coque>
  );
}
