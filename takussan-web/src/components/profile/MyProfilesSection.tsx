'use client';

import { useMyProfiles } from '@/hooks/useProfiles';
import type { Profile, ProfileType } from '@/types/profile';
import { ProfileBadge, profileTypeLabel } from './ProfileBadge';

const KYC_FIELDS: Record<ProfileType, { label: string; help: string }[]> = {
  owner: [
    { label: 'RIB', help: 'Iban / BIC pour le versement des loyers.' },
    { label: 'Identifiant fiscal (tax_id)', help: 'Pour les retenues à la source.' },
  ],
  agent: [
    { label: 'Numéro de licence', help: 'Carte professionnelle agence — license_number.' },
  ],
  broker: [
    { label: 'Numéro de licence', help: 'Carte professionnelle de courtier indépendant.' },
  ],
  service_provider: [
    { label: 'Certifications', help: 'Liste des certifications métiers (PDF + champ libre).' },
    { label: 'Attestation d’assurance', help: 'Responsabilité civile professionnelle.' },
  ],
};

function profileTitle(profile: Profile): string {
  if (profile.agency?.name) return profile.agency.name;
  return profileTypeLabel(profile.type);
}

/**
 * "Mes profils" — one card per profile, with the KYC fields specific to its
 * type. Read-only first iteration: KYC editing endpoints land in a follow-up
 * ticket (creation / suspension by agency_admin — see TCK-143 hors-périmètre).
 */
export function MyProfilesSection() {
  const { data, isLoading, isError } = useMyProfiles();

  if (isLoading) {
    return (
      <section className="space-y-3 rounded-2xl bg-app-surface-1 p-6">
        <header>
          <h2 className="text-lg font-bold text-app-ink">Mes profils</h2>
          <p className="text-sm text-app-ink-muted">Chargement…</p>
        </header>
        <div className="h-24 animate-pulse rounded-xl bg-app-surface-2" aria-hidden="true" />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="space-y-3 rounded-2xl bg-app-surface-1 p-6">
        <header>
          <h2 className="text-lg font-bold text-app-ink">Mes profils</h2>
          <p className="text-sm text-app-ink-muted">Impossible de charger vos profils.</p>
        </header>
      </section>
    );
  }

  const profiles = data.data;

  if (profiles.length === 0) {
    return (
      <section className="space-y-3 rounded-2xl bg-app-surface-1 p-6">
        <header>
          <h2 className="text-lg font-bold text-app-ink">Mes profils</h2>
          <p className="text-sm text-app-ink-muted">
            Aucun profil métier rattaché à votre compte.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl bg-app-surface-1 p-6" data-testid="my-profiles-section">
      <header>
        <h2 className="text-lg font-bold text-app-ink">Mes profils</h2>
        <p className="text-sm text-app-ink-muted">
          Une carte par profil avec ses informations KYC propres.
        </p>
      </header>
      <ul className="space-y-3">
        {profiles.map((profile) => {
          const fields = KYC_FIELDS[profile.type] ?? [];
          const isActive = data.meta.active_profile_id === profile.id;
          return (
            <li
              key={profile.id}
              data-testid={`my-profile-card-${profile.id}`}
              className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-app-surface-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-app-ink">{profileTitle(profile)}</p>
                  <div className="flex items-center gap-2 text-xs text-app-ink-muted">
                    <ProfileBadge profile={profile} />
                    {profile.status ? <span>· {profile.status}</span> : null}
                    {isActive ? (
                      <span className="font-medium text-emerald-700">· Profil actif</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.label} className="space-y-0.5">
                    <dt className="text-xs font-semibold text-app-ink-muted">{field.label}</dt>
                    <dd className="text-sm text-app-ink-muted">{field.help}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
