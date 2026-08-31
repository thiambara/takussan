'use client';

import { useTranslations } from 'next-intl';
import { useMyProfiles } from '@/hooks/useProfiles';
import type { Profile, ProfileType } from '@/types/profile';
import { ProfileBadge, profileTypeLabel } from './ProfileBadge';

/**
 * Les types affichés dans « Mes profils » — délibérément SANS `agency_admin`.
 *
 * ⚠ Cette liste n'est pas dérivée de `PROFILE_TYPES` : c'est un choix éditorial
 * de cette section, pas un inventaire du fil. La contrepartie est qu'elle ne
 * signalera pas un nouveau type — assumé, parce qu'un type non listé y est
 * simplement absent d'une carte, jamais rendu comme `undefined`.
 */
const DISPLAY_TYPES: ReadonlySet<ProfileType> = new Set([
  'owner',
  'agent',
  'service_provider',
]);

/**
 * `Record<ProfileType, …>` complet — l'ajout d'`agency_admin` à `PROFILE_TYPES`
 * a fait échouer `tsc --noEmit` ICI (TS2741, mesuré le 2026-08-20), et c'est le
 * signal que TCK-329 AC5 demande : un type de profil ajouté côté back ne peut
 * plus traverser le front en silence.
 */
const KYC_FIELDS: Record<ProfileType, { labelKey: string; helpKey: string }[]> = {
  // Un `agency_admin` n'a aucun champ KYC propre : il est administrateur d'une
  // agence, pas un profil métier avec des pièces à fournir. La liste vide est
  // le contenu JUSTE, pas un trou — et `DISPLAY_TYPES` l'écarte de toute façon
  // de cette section.
  agency_admin: [],
  owner: [
    { labelKey: 'kyc.owner.rib.label', helpKey: 'kyc.owner.rib.help' },
    { labelKey: 'kyc.owner.taxId.label', helpKey: 'kyc.owner.taxId.help' },
  ],
  agent: [
    { labelKey: 'kyc.agent.license.label', helpKey: 'kyc.agent.license.help' },
  ],
  service_provider: [
    { labelKey: 'kyc.serviceProvider.certifications.label', helpKey: 'kyc.serviceProvider.certifications.help' },
    { labelKey: 'kyc.serviceProvider.insurance.label', helpKey: 'kyc.serviceProvider.insurance.help' },
  ],
};

function profileTitle(profile: Profile, tTypes: (cle: string) => string): string {
  if (profile.agency?.name) return profile.agency.name;
  return profileTypeLabel(profile.type, tTypes);
}

/**
 * "Mes profils" — one card per profile, with the KYC fields specific to its
 * type. Read-only first iteration: KYC editing endpoints land in a follow-up
 * ticket (creation / suspension by agency_admin — see TCK-143 hors-périmètre).
 */
export function MyProfilesSection() {
  const t = useTranslations('profile.myProfiles');
  const tTypes = useTranslations('profile.types');
  const tCommon = useTranslations('common.status');
  const { data, isLoading, isError } = useMyProfiles();

  if (isLoading) {
    return (
      <section className="space-y-3 rounded-2xl bg-card p-6">
        <header>
          <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
        </header>
        <div className="h-24 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="space-y-3 rounded-2xl bg-card p-6">
        <header>
          <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('error')}</p>
        </header>
      </section>
    );
  }

  // Backend `/api/me/profiles` ships `agency_admin` profiles alongside the
  // four métier profiles (used by ActiveProfileResolver for team scoping),
  // but they share an agency with the user's owner/agent row and would
  // surface as a second "ghost" card with no KYC fields. Keep only métier
  // profiles here.
  //
  // ⚠ Ce commentaire disait « Mirror the ProfileSwitcher's filter ». Ce n'est
  // PLUS vrai depuis TCK-329 : le sélecteur groupe désormais `agency_admin`
  // (AC3), parce qu'il sert à CHANGER de profil actif et qu'un `agency_admin`
  // en est un de plein droit. Le filtre de cette section-ci ne concerne que
  // l'affichage des cartes KYC — les deux listes ont divergé volontairement.
  const profiles = data.data.filter((p) => DISPLAY_TYPES.has(p.type));

  if (profiles.length === 0) {
    return (
      <section className="space-y-3 rounded-2xl bg-card p-6">
        <header>
          <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('empty')}
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl bg-card p-6" data-testid="my-profiles-section">
      <header>
        <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('description')}
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
              className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-muted"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">{profileTitle(profile, tTypes)}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ProfileBadge profile={profile} />
                    {profile.status ? <span>· {profile.status}</span> : null}
                    {isActive ? (
                      <span className="font-medium text-success">{t('activeProfile')}</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.labelKey} className="space-y-0.5">
                    <dt className="text-xs font-semibold text-muted-foreground">{t(field.labelKey)}</dt>
                    <dd className="text-sm text-muted-foreground">{t(field.helpKey)}</dd>
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
