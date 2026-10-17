import { ApiError } from '@/lib/api';

/**
 * TCK-775 (P14.11) — la trace côté serveur d'une erreur INATTENDUE dans une server action.
 *
 * Une server action rend à l'écran un message de repli (« erreur réseau, réessayez ») pour toute
 * erreur qui n'est pas une `ApiError`. Sans ce journal, un bug (`TypeError`, corps mal formé)
 * devenait une panne réseau aux yeux de l'utilisateur, et rien ne s'écrivait côté serveur Next.
 *
 * Ce qui s'écrit : le module, le nom, le message et la pile de l'erreur. **Jamais les données
 * saisies** — ni les arguments de l'action, ni la `cause`, qui peut porter la requête. Une
 * `ApiError` ne s'écrit pas : c'est une réponse de l'API, que l'API journalise elle-même.
 *
 * À appeler dans chaque `catch` d'un module `'use server'` de `src/app/actions/` (le recensement
 * de `erreurs-inattendues-journalisees.test.ts` le garde).
 */
export function journaliserErreurInattendue(module: string, err: unknown): void {
  if (err instanceof ApiError) return;
  if (err instanceof Error) {
    console.error(`[server-action:${module}] ${err.name}: ${err.message}\n${err.stack ?? ''}`);
    return;
  }
  console.error(`[server-action:${module}] valeur levée qui n'est pas une Error (${typeof err})`);
}
