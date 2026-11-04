<?php

namespace App\Services\Search\Query;

/**
 * TCK-2476 (ADR-0088 §7) — les variantes d'écriture d'un TYPE de bien ou d'un TERME du vocabulaire de
 * {@see SearchQueryParser} (« apparts » → `type=apartment`, « clime » → `tags=Climatisation`), que le parseur lit comme
 * ses propres phrases. Les variantes d'un LIEU passent par {@see PlaceLexicon}.
 *
 * Implémentation par défaut : {@see DatabaseVocabularyAliases} (les variantes actives de `search_aliases`). Sans elle
 * (tests du parseur), le parseur ne lit que son vocabulaire.
 */
interface VocabularyAliases
{
    /**
     * `alias` : l'écriture (le parseur la replie) ; `key`/`value` : le critère qu'elle émet, dans la forme du parseur
     * (`type` → valeur de `PropertyType`, `tags` → nom du catalogue, `furnished` → booléen…).
     *
     * @return list<array{alias: string, key: string, value: string|bool}>
     */
    public function entries(): array;
}
