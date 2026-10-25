import type { Instrumentation } from 'next';

import { ligneErreur } from '@/lib/journal-erreur';

/**
 * TCK-2356 (P14.07) — toute erreur que le serveur de Next attrape (rendu, action serveur, route
 * handler, proxy) part en UNE ligne JSON sur la sortie standard du conteneur, que `docker logs`
 * garde. Avant ce fichier, le `digest` montré à l'utilisateur ne renvoyait à rien qu'on puisse
 * consulter.
 *
 * La forme et ce qui n'y entre jamais (message, chemin réel, en-têtes) : `@/lib/journal-erreur`.
 * Le chemin est remplacé par le GABARIT de la route (`routePath`), et `request.headers` n'est
 * jamais lu.
 *
 * `console.log` et non `process.stdout` : ce fichier est aussi compilé pour le runtime edge, qui
 * n'a pas `process.stdout`. Sous Node, `console.log` écrit sur la sortie standard.
 *
 * Le rapporteur d'erreurs (GlitchTip ou Sentry) attend son ADR, avant la phase F.
 */
export const onRequestError: Instrumentation.onRequestError = (erreur, requete, contexte) => {
  console.log(
    JSON.stringify(
      ligneErreur('request_error', erreur, {
        method: requete.method,
        route: contexte.routePath,
        route_type: contexte.routeType,
        router_kind: contexte.routerKind,
        render_source: contexte.renderSource,
        revalidate_reason: contexte.revalidateReason,
      }),
    ),
  );
};
