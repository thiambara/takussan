import { getTranslations } from 'next-intl/server';

import { StatusBadge } from '@/components/console/StatusBadge';
import type { Profile, ProfileType } from '@/types/profile';

/** Les statuts que `profile.myProfiles.statuts` sait dire ; un autre ne s'affiche pas (jamais en code). */
const STATUTS_CONNUS: ReadonlySet<string> = new Set(['active', 'archived', 'blocked', 'draft', 'inactive', 'suspended']);
const ORDRE: readonly ProfileType[] = ['agent', 'owner', 'service_provider', 'agency_admin'];

interface Espace {
  readonly cle: string;
  readonly nom: string;
  readonly profils: readonly Profile[];
}

/** Un espace par agence (l'agent et l'admin d'une même agence n'en font qu'un), un par profil sans agence. */
function espacesDe(profils: readonly Profile[], libelleDuType: (type: ProfileType) => string): Espace[] {
  const parCle = new Map<string, Profile[]>();
  for (const p of [...profils].sort((a, b) => ORDRE.indexOf(a.type) - ORDRE.indexOf(b.type))) {
    const cle = p.agency_id !== null ? `agence:${p.agency_id}` : p.id;
    parCle.set(cle, [...(parCle.get(cle) ?? []), p]);
  }
  return [...parCle.entries()].map(([cle, groupe]) => ({
    cle,
    nom: groupe.find((p) => p.agency?.name)?.agency?.name ?? libelleDuType(groupe[0]!.type),
    profils: groupe,
  }));
}

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]!.toUpperCase())
    .join('');
}

/**
 * TCK-2635 — « Mes espaces » à la vue d'ensemble du bureau (maquette `ASommaireBureau`) : une ligne par
 * espace — son nom, son statut, « Espace en cours » pour celui du profil actif, puis les rôles, la ville
 * et la carte professionnelle. Le détail (une carte par profil, les informations KYC) reste à sa page,
 * `/app/profile/spaces`. Comme TCK-2621 : jamais de slug ; une agence sans adresse n'a pas de ville.
 */
export async function MesEspacesEnBref({ profils, profilActif }: { readonly profils: readonly Profile[] | null; readonly profilActif: string | null }) {
  if (!profils || profils.length === 0) return null;
  const [t, tTypes, tStatuts] = await Promise.all([
    getTranslations('profile.sommaire.espaces'),
    getTranslations('profile.types'),
    getTranslations('profile.myProfiles.statuts'),
  ]);
  const libelleDuType = (type: ProfileType) => tTypes(type);
  const espaces = espacesDe(profils, libelleDuType);
  return (
    <section aria-labelledby="mes-espaces-en-bref">
      <h2 id="mes-espaces-en-bref" className="mb-2 text-corps font-semibold">
        {t('titre')}
      </h2>
      <ul className="grid gap-2">
        {espaces.map((espace) => {
          const principal = espace.profils[0]!;
          const statut = principal.status && STATUTS_CONNUS.has(principal.status) ? principal.status : null;
          const enCours = espace.profils.some((p) => p.id === profilActif);
          const ville = espace.profils.find((p) => p.agency?.city)?.agency?.city ?? null;
          const carte = espace.profils.find((p) => p.type === 'agent' && p.license_number)?.license_number ?? null;
          const detail = [
            espace.profils.map((p) => libelleDuType(p.type)).join(', '),
            ville,
            carte ? t('carte', { numero: carte }) : null,
          ].filter(Boolean);
          return (
            <li key={espace.cle} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
              <span
                aria-hidden="true"
                className="inline-flex size-10 flex-none items-center justify-center rounded-lg bg-secondary text-sm font-semibold text-primary-deep"
              >
                {initiales(espace.nom)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-corps font-semibold">
                  {espace.nom}
                  {statut ? <StatusBadge tone={statut === 'active' ? 'success' : 'neutral'} label={tStatuts(statut)} /> : null}
                  {enCours ? <StatusBadge tone="info" label={t('enCours')} /> : null}
                </p>
                <p className="text-ui text-muted-foreground">{detail.join(' · ')}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
