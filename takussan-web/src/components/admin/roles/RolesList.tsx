'use client';

import { Lock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoleListItem } from '@/types/admin-roles';

interface RolesListProps {
  readonly roles: readonly RoleListItem[];
  readonly selectedId: number | null;
  readonly onSelect: (role: RoleListItem) => void;
}

const PREDEFINED_LABEL: Record<string, string> = {
  super_admin: 'Super admin',
  admin: 'Admin plateforme',
  agency_admin: 'Admin d’agence',
  agent: 'Agent',
  owner: 'Propriétaire',
  tenant: 'Locataire',
  customer: 'Client',
  service_provider: 'Prestataire',
};

export function RolesList({ roles, selectedId, onSelect }: RolesListProps) {
  const predefined = roles.filter((r) => r.is_predefined);
  const custom = roles.filter((r) => !r.is_predefined);

  return (
    <div className="space-y-6">
      <Section title="Rôles prédéfinis" testId="roles-list-predefined">
        {predefined.length === 0 ? (
          <Empty>Aucun rôle prédéfini.</Empty>
        ) : (
          predefined.map((role) => (
            <RoleRow
              key={role.id}
              role={role}
              label={PREDEFINED_LABEL[role.name] ?? role.name}
              selected={role.id === selectedId}
              onSelect={onSelect}
              readOnly
            />
          ))
        )}
      </Section>

      <Section title="Rôles personnalisés" testId="roles-list-custom">
        {custom.length === 0 ? (
          <Empty>Aucun rôle personnalisé pour l’instant.</Empty>
        ) : (
          custom.map((role) => (
            <RoleRow
              key={role.id}
              role={role}
              label={role.name}
              selected={role.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-app-ink-muted">
        {title}
      </h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-input px-3 py-2 text-xs text-app-ink-muted">
      {children}
    </p>
  );
}

interface RoleRowProps {
  readonly role: RoleListItem;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: (role: RoleListItem) => void;
  readonly readOnly?: boolean;
}

function RoleRow({ role, label, selected, onSelect, readOnly }: RoleRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(role)}
      data-testid={`role-row-${role.name}`}
      data-selected={selected || undefined}
      className={cn(
        'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
        selected
          ? 'border-app-accent bg-app-accent/5 text-app-ink'
          : 'border-input bg-background text-app-ink hover:bg-app-surface-2',
      )}
    >
      <span className="flex items-center gap-2">
        {readOnly ? (
          <Lock aria-hidden="true" className="h-3.5 w-3.5 text-app-ink-muted" />
        ) : (
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-app-accent" />
        )}
        <span className="truncate">{label}</span>
      </span>
      {readOnly ? (
        <span className="text-xs text-app-ink-muted">Lecture seule</span>
      ) : null}
    </button>
  );
}
