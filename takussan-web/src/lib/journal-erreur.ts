/**
 * TCK-2356 (P14.07) — la ligne de journal d'une erreur du front, en JSON.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA FORME : CELLE DE L'API, POUR UN SEUL COLLECTEUR
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'enveloppe est celle du `JsonFormatter` de Monolog, que le canal `exceptions` de l'API écrit
 * (`takussan-api/config/logging.php`) : `message`, `context`, `level`, `level_name`, `channel`,
 * `datetime`, `extra`. Le contexte suit `SafeExceptionContext` (ADR-0044 §2) : la classe, le
 * `digest`, la pile réduite à ses cadres.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI N'Y ENTRE JAMAIS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * · **Le message de l'erreur**, ni la première ligne de la pile, qui le recopie : c'est une donnée,
 *   pas un diagnostic (une erreur de l'API cite ce que l'utilisateur a saisi) ;
 * · **le chemin réel** : `/pay/<jeton>`, `/invitations/<jeton>` portent un droit. Seul le gabarit
 *   de la route (`/[locale]/pay/[token]`) est écrit ;
 * · **les en-têtes**, donc ni `Authorization` ni `Cookie`, et aucun corps.
 *
 * Le `digest` relie la ligne à l'écran : c'est la « référence technique » que la frontière
 * d'erreur montre à l'utilisateur.
 */

const MAX_CADRES = 15;

type Contexte = Record<string, string | undefined>;

export type LigneErreur = {
  readonly message: string;
  readonly context: Record<string, unknown>;
  readonly level: 400;
  readonly level_name: 'ERROR';
  readonly channel: 'web';
  readonly datetime: string;
  readonly extra: Record<string, never>;
};

/** Les cadres de la pile, sans sa première ligne (`Error: <message>`). */
function cadres(pile: string | undefined): string[] {
  if (!pile) return [];
  return pile
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.startsWith('at '))
    .slice(0, MAX_CADRES)
    .map((ligne) => ligne.slice(3));
}

export function ligneErreur(message: string, erreur: unknown, contexte: Contexte = {}): LigneErreur {
  const objet = typeof erreur === 'object' && erreur !== null ? (erreur as { name?: unknown; digest?: unknown; stack?: unknown }) : null;
  const champs: Record<string, unknown> = {
    exception: objet && typeof objet.name === 'string' ? objet.name : typeof erreur,
    digest: objet && typeof objet.digest === 'string' ? objet.digest : undefined,
    trace: cadres(objet && typeof objet.stack === 'string' ? objet.stack : undefined),
  };
  for (const [cle, valeur] of Object.entries(contexte)) {
    if (valeur !== undefined) champs[cle] = valeur;
  }

  return {
    message,
    context: Object.fromEntries(Object.entries(champs).filter(([, v]) => v !== undefined)),
    level: 400,
    level_name: 'ERROR',
    channel: 'web',
    datetime: new Date().toISOString(),
    extra: {},
  };
}
