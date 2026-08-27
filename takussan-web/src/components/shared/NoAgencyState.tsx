import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';

interface NoAgencyStateProps {
  /** Titre de PAGE, déjà traduit par l'appelant — pas le titre de l'état vide. */
  readonly title?: string;
}

/**
 * L'écran « aucune agence rattachée », rendu par 8 pages du tableau de bord.
 *
 * Il était le seul état vide DÉJÀ partagé du dépôt — et il était partagé **à côté**
 * d'`EmptyState`, pas au-dessus : il recopiait sa propre pastille d'icône, son propre
 * `rounded-2xl bg-card p-12 text-center` et son propre empilement titre/corps/CTA. Un
 * second état vide partagé n'est pas mieux qu'un état vide ad-hoc, c'est pire : il a huit
 * consommateurs qui croient tous suivre la convention.
 *
 * Il ne rend donc plus que ce qui lui est PROPRE — le cadrage de page et le contenu — et délègue
 * la forme à `EmptyState` (TCK-291).
 */
export function NoAgencyState({ title }: NoAgencyStateProps) {
  const t = useTranslations('errors.noAgency');

  return (
    <div className="space-y-6">
      {title && (
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        </div>
      )}
      <EmptyState
        icon={<Building2 className="size-8" aria-hidden="true" />}
        title={t('title')}
        description={t('body')}
        action={
          <Link href="/admin" className={buttonVariants({ variant: 'outline' })}>
            {t('cta')}
          </Link>
        }
      />
    </div>
  );
}
