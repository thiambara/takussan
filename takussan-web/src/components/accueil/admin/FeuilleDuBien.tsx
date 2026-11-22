'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Vignette } from '@/components/visits/planification/PiecesDeLaPlanification';
import { Button, buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { useToast } from '@/components/ui/toast';
import { estUnRefus } from '@/lib/accueil/a-faire';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useValiderLeBien } from '@/lib/queries/accueil';
import type { ModerationProperty } from '@/lib/queries/property-moderation';

/**
 * TCK-2624 — « Valider » un bien depuis l'accueil : la feuille du bas au téléphone, le panneau de
 * droite au bureau (`FeuilleDuBas`, décision du porteur du 2026-11-11). Elle rappelle ce qui est
 * validé (photo, titre, qui le propose, prix) et porte l'approbation de la modération — sous la garde
 * du second facteur. Au succès, la famille `['property-moderation']` est relue : la carte quitte
 * l'accueil, la pastille « Biens à valider » baisse.
 */
export function FeuilleDuBien({
  bien,
  onFermer,
  onRefuse,
}: {
  readonly bien: ModerationProperty;
  readonly onFermer: () => void;
  /** L'API refuse le geste (403) : l'accueil le retire. */
  readonly onRefuse: () => void;
}) {
  const t = useTranslations('accueil.admin.feuilleDuBien');
  const f = useFormatteurs();
  const toast = useToast();
  const valider = useValiderLeBien();

  const envoyer = () =>
    valider.mutate(
      { id: bien.id },
      {
        onSuccess: () => {
          toast.add({ title: t('valide', { bien: bien.title }), type: 'success' });
          onFermer();
        },
        onError: (e) => {
          if (estUnRefus(e)) {
            toast.add({ title: t('refuse'), type: 'error' });
            onRefuse();
            return;
          }
          toast.add({ title: (e instanceof ApiError && e.displayMessage) || t('erreur'), type: 'error' });
        },
      },
    );

  return (
    <FeuilleDuBas
      open
      onOpenChange={(ouverte) => {
        if (!ouverte) onFermer();
      }}
      titre={t('titre')}
      pied={
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
          <Link href={`/app/agency/moderation/properties?selected=${bien.id}`} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            {t('ouvrir')}
          </Link>
          <Button size="lg" className="font-semibold" disabled={valider.isPending} onClick={envoyer}>
            {t('valider')}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <Vignette src={bien.main_photo_url} className="size-16" />
        <div className="min-w-0 flex-1">
          <p className="text-corps font-semibold">{bien.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[bien.owner?.name ? t('parQui', { proprietaire: bien.owner.name }) : null, f.montantCourt(bien.price, bien.currency ?? 'XOF')].filter(Boolean).join(' · ')}
          </p>
          {bien.reference_number ? <p className="mt-0.5 text-ui text-muted-foreground tabular-nums">{bien.reference_number}</p> : null}
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{t('explication')}</p>
    </FeuilleDuBas>
  );
}
