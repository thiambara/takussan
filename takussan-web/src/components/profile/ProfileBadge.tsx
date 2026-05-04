import { cn } from '@/lib/utils';
import type { Profile, ProfileType } from '@/types/profile';

const TYPE_LABEL: Record<ProfileType, string> = {
  owner: 'Propriétaire',
  agent: 'Agent',
  broker: 'Courtier',
  service_provider: 'Prestataire',
};

const TYPE_COLOR: Record<ProfileType, string> = {
  owner: 'bg-emerald-100 text-emerald-900',
  agent: 'bg-sky-100 text-sky-900',
  broker: 'bg-violet-100 text-violet-900',
  service_provider: 'bg-amber-100 text-amber-900',
};

export function profileTypeLabel(type: ProfileType): string {
  return TYPE_LABEL[type];
}

export function profileShortLabel(profile: Profile): string {
  const type = TYPE_LABEL[profile.type];
  if (profile.agency?.name) return `${type} · ${profile.agency.name}`;
  return type;
}

interface ProfileBadgeProps {
  profile: Profile;
  variant?: 'pill' | 'dot';
  className?: string;
}

export function ProfileBadge({ profile, variant = 'pill', className }: ProfileBadgeProps) {
  if (variant === 'dot') {
    return (
      <span
        aria-hidden="true"
        className={cn('inline-block size-2 rounded-full', TYPE_COLOR[profile.type], className)}
      />
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        TYPE_COLOR[profile.type],
        className,
      )}
    >
      {TYPE_LABEL[profile.type]}
    </span>
  );
}
