'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Compass, Home } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ChoiceCard, ChoiceCardGroup } from '@/components/ui/choice-card';
import { useAuth } from '@/context/AuthContext';
import type { EntryIntent } from '@/types/user';

/**
 * TCK-493 — un écran, une question, deux réponses.
 *
 * **Pourquoi ici et pas ailleurs.** C'est le seul moment où la personne est
 * disponible pour répondre : elle vient de faire l'effort de créer un compte et
 * n'a encore rien à faire. Une question posée là remplace un tableau de bord
 * vide, une découverte au hasard et une relance par e-mail.
 *
 * ⚠ **La réponse ORIENTE, elle n'attribue rien.** Aucun profil n'est créé,
 * aucune capacité accordée : « je veux publier » mène à `/onboarding/host`, qui
 * reste seul juge de ce qu'il crée. `MeUpdateTest::test_repondre_a_la_question_
 * ne_cree_aucun_profil` épingle la propriété côté API.
 *
 * ⚠ **On peut passer, et « passer » s'enregistre.** Un onboarding qui barre
 * l'accès au produit coûte plus qu'il ne rapporte. Mais un passage qui
 * n'écrirait rien ferait reposer la question à la connexion suivante — ce qui
 * n'est pas passer, c'est repousser. D'où `'skipped'`, qui est une réponse.
 */
const DESTINATIONS: Record<Exclude<EntryIntent, 'skipped'>, string> = {
  search: '/properties',
  publish: '/onboarding/host',
};

export function QuestionDIntention({ apres }: { readonly apres: string }) {
  const t = useTranslations('onboarding.intention');
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [choix, setChoix] = useState<'search' | 'publish'>('search');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  async function enregistrer(intent: EntryIntent): Promise<boolean> {
    const res = await fetch('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_intent: intent }),
    });
    return res.ok;
  }

  function repondre(intent: EntryIntent, destination: string) {
    setErreur(null);
    demarrer(async () => {
      const ok = await enregistrer(intent);
      if (!ok) {
        setErreur(t('error'));
        return;
      }
      // Le `user` en mémoire porte `preferences` : sans ce rafraîchissement, un
      // retour arrière rouvrirait la question à quelqu'un qui vient d'y répondre.
      await refreshUser();
      router.replace(destination);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <ChoiceCardGroup legend={t('legend')}>
        <ChoiceCard
          name="entry-intent"
          value="search"
          checked={choix === 'search'}
          onSelect={() => setChoix('search')}
          disabled={enCours}
          icon={<Compass className="size-5" aria-hidden />}
          title={t('options.search.title')}
          description={t('options.search.body')}
        />
        <ChoiceCard
          name="entry-intent"
          value="publish"
          checked={choix === 'publish'}
          onSelect={() => setChoix('publish')}
          disabled={enCours}
          icon={<Home className="size-5" aria-hidden />}
          title={t('options.publish.title')}
          description={t('options.publish.body')}
        />
      </ChoiceCardGroup>

      {erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button
          type="button"
          size="lg"
          disabled={enCours}
          onClick={() => repondre(choix, DESTINATIONS[choix])}
        >
          {enCours ? t('submitting') : t('submit')}
        </Button>
        <button
          type="button"
          disabled={enCours}
          onClick={() => repondre('skipped', apres)}
          className="rounded-lg px-1 py-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
        >
          {t('skip')}
        </button>
      </div>
    </div>
  );
}
