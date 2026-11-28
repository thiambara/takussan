import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * TCK-565 — les phrases d'une réponse 422 de Laravel, UNE PAR PROBLÈME, sans doublon ; `null` si
 * l'erreur n'est pas une erreur de validation qui en porte.
 *
 * ⚠️ **Pourquoi pas le `message` de la réponse**, que `messageErreurApi` affiche : sur une 422,
 * Laravel y met un RÉSUMÉ — la première erreur, suivie de « (and N more error) »
 * (`ValidationException::summarize`). Le retour testeur du 2026-09-23 (M13) montrait exactement
 * ce résumé à l'écran : « The selected participants.0 is invalid. (and 1 more error) ». Deux
 * défauts s'y cumulaient, qui ne dépendent pas l'un de l'autre :
 *
 *  1. le suffixe est une clé de traduction JSON du framework, que le dépôt ne traduisait pas ;
 *  2. surtout, le résumé CACHE les erreurs suivantes : « (et 1 autre erreur) » ne dit pas laquelle.
 *
 * Le premier se corrige côté API (`lang/*.json`), le second ne peut se corriger qu'ici : on
 * affiche chaque phrase de `errors`, qui sont celles que l'API a écrites pour l'utilisateur
 * (`messaging.errors.*`).
 */
export function phrasesDeValidation(erreur: unknown): string[] | null {
  if (!(erreur instanceof ApiError)) return null;
  // TCK-3008 — l'aplatissement est celui d'`ApiError` ; restent ici ce que la messagerie y ajoute : ni
  // phrase blanche, ni doublon (deux champs qui disent la même chose ne s'affichent qu'une fois).
  const phrases = erreur.messagesDeValidation().filter((phrase) => phrase.trim().length > 0);

  return phrases.length > 0 ? [...new Set(phrases)] : null;
}

/**
 * Le bloc d'erreur des écrans de messagerie : une phrase seule, ou la liste quand il y en a
 * plusieurs. `role="alert"` : l'erreur arrive après une action, elle doit être annoncée.
 */
export function AlerteErreurs({
  erreurs,
  className,
}: {
  readonly erreurs: readonly string[];
  readonly className?: string;
}) {
  if (erreurs.length === 0) return null;

  return (
    <div role="alert" data-testid="messaging-errors" className={cn('text-sm text-destructive', className)}>
      {erreurs.length === 1 ? (
        <p>{erreurs[0]}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {erreurs.map((phrase) => (
            <li key={phrase}>{phrase}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
