'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * Le refus du serveur, RENDU — et c'est la moitié front de TCK-389.
 *
 * Le plafond de 60 buckets tronquait une plage trop large sans le dire ; il rend désormais 422. Mais
 * un 422 laissé à `query.error` se serait affiché comme `rows = []`, c'est-à-dire « Aucune donnée
 * sur cette période » : la troncature silencieuse aurait simplement changé de forme, en devenant un
 * état vide qui accuse les données au lieu de la demande.
 *
 * Le texte affiché est la prose DÉJÀ LOCALISÉE de Laravel quand il y en a une (`messageErreurApi`
 * la préfère au repli) : c'est elle qui nomme la contrainte — « dépasse le plafond de 60
 * intervalles » —, et l'appelant saurait sinon seulement que « ça n'a pas marché ».
 */
export function ReportError({ erreur }: { erreur: unknown }) {
  const t = useTranslations('reporting');
  const messageErreur = useMessageErreurApi();

  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4" role="alert" data-testid="report-error">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">{t('error.title')}</p>
          <p className="text-sm text-muted-foreground">{messageErreur(erreur, t('error.fallback'))}</p>
        </div>
      </CardContent>
    </Card>
  );
}
