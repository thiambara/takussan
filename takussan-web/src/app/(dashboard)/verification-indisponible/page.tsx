import { AlertTriangle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

/**
 * « Nous n'avons pas pu vérifier vos accès » — et c'est une PAGE, pas un message d'erreur.
 *
 * Les gardes Standard-only sont fail-closed : sans réponse de l'API, elles refusent. Mais un
 * refus muet vers `/app`, tous les accès pro cadenassés, est indiscernable d'un déclassement de
 * forfait pour un `agency_admin` d'une agence `standard`.
 *
 * La première tentative levait une erreur marquée, reconnue par `(dashboard)/error.tsx`. Elle ne
 * fonctionnait qu'en développement : Next expurge les messages d'erreur des Server Components en
 * production. Une redirection, elle, ne dépend d'aucune sérialisation.
 *
 * `/app` veut dire « non » ; cette route dit « je n'ai pas pu demander ». Deux réponses
 * différentes à deux questions différentes.
 *
 * ⚠ Cette page vit sous `(dashboard)/` et NON sous `(dashboard)/app/`, délibérément.
 *
 * Le layout `app/` interroge `/api/agencies/{id}` pour poser les cadenas. Or on arrive ici
 * précisément parce que cet endpoint est saturé : la page de secours ajoutait donc une requête
 * à la ressource limitée qui l'a fait apparaître — et affichait, autour d'un texte disant « ce
 * n'est pas un changement de votre formule », une barre latérale dont chaque entrée pro était
 * cadenassée.
 *
 * *Une page de secours qui sollicite la ressource en panne n'est pas un secours.*
 *
 * ⚠ PORTÉE RÉELLE, plus étroite que ce que les commentaires précédents laissaient croire.
 * Cette page vit sous `(dashboard)/app/`, dont le layout appelle `getMeAction()` — qui relance
 * toute erreur autre qu'un 401. Quand c'est l'API ENTIÈRE qui est indisponible, `/api/user`
 * échoue aussi : la page gardée lève avant même d'atteindre la vérification d'agence, et la
 * redirection ici lèverait à son tour. C'est alors `src/app/error.tsx` qui répond — la frontière
 * RACINE, car un `error.tsx` n'attrape pas ce que lève le `layout.tsx` de son propre segment. Son
 * message générique dit « réessayez », donc l'utilisateur ne conclut pas au déclassement, mais
 * il n'obtient pas le message précis.
 *
 * Cette route rend donc dans le cas où `/api/user` répond et où `/api/agencies/{id}` SEUL
 * échoue en 429/5xx : une surcharge ciblée, un rate-limit. C'est un cas réel, et c'est celui
 * qui motivait le correctif — mais ce n'est pas « toute panne d'API ».
 *
 * *Une garantie se décrit par ce qui l'atteint, pas par ce qu'on voulait qu'elle couvre.*
 */
export default async function VerificationIndisponiblePage() {
  const t = await getTranslations('errors.boundary');

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="size-10 text-app-accent" aria-hidden />
      <h1 className="text-xl font-semibold text-app-ink">{t('agencyTitle')}</h1>
      <p className="max-w-md text-sm text-app-ink-muted">{t('agencyBody')}</p>
      <Link href="/app" className={buttonVariants()}>
        {t('retry')}
      </Link>
    </div>
  );
}
