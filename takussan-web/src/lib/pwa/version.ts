import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * La version du déploiement, dans l'ordre : `BUILD_SHA` (argument de build de l'image Docker,
 * ADR-0028 §10), le commit de Vercel, puis l'identifiant du build Next (`.next/BUILD_ID`, présent
 * dans la sortie `standalone`). ⚠ `BUILD_SHA` n'existe qu'au BUILD de l'image, pas dans son
 * étage d'exécution (`takussan-web/Dockerfile`) : sur `preview`, c'est donc `BUILD_ID` qui sert.
 */
export function versionDuDeploiement(
  env: Readonly<Record<string, string | undefined>> = process.env,
  racine = process.cwd(),
): string {
  const sha = env.BUILD_SHA;
  if (sha && sha !== 'inconnu') return sha;
  if (env.VERCEL_GIT_COMMIT_SHA) return env.VERCEL_GIT_COMMIT_SHA;
  try {
    const id = readFileSync(path.join(racine, '.next', 'BUILD_ID'), 'utf8').trim();
    if (id) return id;
  } catch {
    // `next dev`, tests : pas de build.
  }
  return 'dev';
}
