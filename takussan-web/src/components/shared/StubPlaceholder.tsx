import { Construction } from 'lucide-react';

interface StubPlaceholderProps {
  label: string;
  description?: string;
}

export function StubPlaceholder({ label, description }: StubPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-app-surface-1 p-12 text-center">
      <Construction className="size-10 text-app-accent" />
      <p className="text-sm font-semibold text-app-ink">En cours de développement</p>
      <p className="text-xs text-app-ink-muted">{description ?? label}</p>
    </div>
  );
}
