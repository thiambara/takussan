import { Globe, Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  readonly visibility: string | null;
  readonly className?: string;
}

export function PropertyVisibilityBadge({ visibility, className }: Props) {
  if (!visibility) return null;
  const isPublic = visibility === 'public';
  const Icon = isPublic ? Globe : Lock;
  return (
    <Badge variant="outline" className={cn('gap-1.5', className)}>
      <Icon aria-hidden="true" />
      {isPublic ? 'Public' : 'Privé'}
    </Badge>
  );
}
