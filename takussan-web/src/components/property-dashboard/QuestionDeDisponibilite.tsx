'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { CircleHelp, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  REPONSES_DE_DISPONIBILITE,
  disponibiliteDuBienKeys,
  lireQuestionDeDisponibilite,
  repondreQuestionDeDisponibilite,
  type QuestionDeDisponibilite as Question,
  type ReponseDeDisponibilite,
} from '@/lib/queries/disponibilite-du-bien';
import type { ApiResponse } from '@/types/api';

/**
 * TCK-2432 — « Ce bien est-il toujours disponible ? » : l'annonce d'origine d'un bien publié par le Radar n'est plus en
 * ligne, et la notification du titulaire mène ici. Trois gestes : loué, vendu (le bien quitte la vitrine, à son statut
 * existant), ou toujours disponible (la réponse est seulement notée). Rien n'est rendu sans question ouverte : l'API ne
 * l'ouvre qu'à qui peut modifier le bien, et rejuge tout au geste.
 */
export function QuestionDeDisponibilite({ propertyId }: { readonly propertyId: number }) {
  const t = useTranslations('property.availabilityCheck');
  const fmt = useFormatteurs();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token } = useAuth();

  const question = useQuery<ApiResponse<Question>, ApiError>({
    queryKey: disponibiliteDuBienKeys.question(propertyId),
    queryFn: ({ signal }) => lireQuestionDeDisponibilite(token ?? '', propertyId, { locale, signal }),
    enabled: Boolean(token),
  });

  const reponse = useMutation({
    mutationFn: (answer: ReponseDeDisponibilite) => {
      if (!token) throw new ApiError(401, { message: t('error') });
      return repondreQuestionDeDisponibilite(token, propertyId, answer, locale);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: disponibiliteDuBienKeys.question(propertyId) });
      // Le statut et la visibilité de l'en-tête sont rendus côté serveur : loué ou vendu, ils changent.
      router.refresh();
    },
  });

  if (reponse.isSuccess) {
    return (
      <p
        role="status"
        className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
        data-testid="question-de-disponibilite-repondue"
      >
        {t('done')}
      </p>
    );
  }

  const donnees = question.data?.data;
  if (!donnees?.open) return null;

  return (
    <section
      aria-labelledby="question-de-disponibilite-titre"
      className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-4"
      data-testid="question-de-disponibilite"
    >
      <div className="flex items-start gap-3">
        <CircleHelp className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <h2 id="question-de-disponibilite-titre" className="text-sm font-semibold text-foreground">
            {t('title')}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('body', {
              date: donnees.asked_at ? fmt.date(donnees.asked_at, { day: 'numeric', month: 'long', year: 'numeric' }) : '',
            })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:pl-8">
        {REPONSES_DE_DISPONIBILITE.map((answer) => (
          <Button
            key={answer}
            size="sm"
            variant={answer === 'available' ? 'default' : 'outline'}
            disabled={reponse.isPending}
            onClick={() => reponse.mutate(answer)}
          >
            {reponse.isPending && reponse.variables === answer ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {t(answer)}
          </Button>
        ))}
      </div>
      {reponse.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {t('error')}
        </p>
      ) : null}
    </section>
  );
}
