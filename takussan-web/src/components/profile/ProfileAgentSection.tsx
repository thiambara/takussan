'use client';

import { useTranslations } from 'next-intl';
import { useMyProfiles } from '@/hooks/useProfiles';
import type { Profile } from '@/types/profile';

/**
 * TCK-1317 (P117.04) — « Profil professionnel » de l'agent, en LECTURE SEULE : l'agence, la licence
 * et la spécialité du profil d'agent, lues sur `GET /api/me/profiles`.
 *
 * La section portait une « Bio professionnelle » et un « Numéro de licence » saisissables sans
 * formulaire ni action (ce qu'on y tapait se perdait), une spécialité « Bientôt disponible » et une
 * agence toujours « Non affilié ». La bio s'édite dans `ProfileHeader` ; la licence et la spécialité
 * s'écrivent par l'assistant d'onboarding.
 *
 * Le profil lu : le profil actif s'il est un profil d'agent, à défaut le premier profil d'agent.
 */
function agentProfileOf(profiles: Profile[], activeId: string | null): Profile | undefined {
  const agents = profiles.filter((p) => p.type === 'agent');
  return agents.find((p) => p.id === activeId) ?? agents[0];
}

export function ProfileAgentSection() {
  const t = useTranslations('profile.agent');
  const { data } = useMyProfiles();
  const profile = data ? agentProfileOf(data.data, data.meta.active_profile_id) : undefined;

  const rows: { label: string; value: string | null | undefined; empty: string }[] = [
    { label: t('agencyLabel'), value: profile?.agency?.name, empty: t('noAgency') },
    { label: t('licenseLabel'), value: profile?.license_number, empty: t('notProvided') },
    { label: t('specialtiesLabel'), value: profile?.specialty, empty: t('notProvided') },
  ];

  return (
    <section className="space-y-4 rounded-2xl bg-card p-6" data-testid="profile-agent-section">
      <div>
        <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="space-y-1">
            <dt className="text-xs font-semibold text-muted-foreground">{row.label}</dt>
            <dd className="text-sm text-foreground">{row.value ? row.value : row.empty}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
