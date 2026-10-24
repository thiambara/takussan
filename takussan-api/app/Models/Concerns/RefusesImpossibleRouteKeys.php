<?php

namespace App\Models\Concerns;

use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * TCK-2115 (P215.01) — une valeur de chemin qui ne peut pas être une clé entière ne désigne
 * aucune ligne : la liaison de route la rend introuvable (404 `http.not_found`, TCK-588) au lieu de
 * la passer à PostgreSQL, qui la refuse (`SQLSTATE[22003]` au-delà de `bigint`, `22P02` pour une
 * valeur non numérique) et faisait rendre 500 à toute route connectée liée à un modèle.
 *
 * La borne est celle de TCK-1851 (P187.05) sur les routes publiques : `[0-9]{1,18}`, toujours
 * dans `bigint`. Seul le champ de clé entier est jugé ; une liaison par un autre champ (`{x:slug}`)
 * ou une clé non entière garde le comportement du framework.
 *
 * Porté par `AbstractModel` et par les deux modèles qui ne l'étendent pas (`User`,
 * `ConversationParticipant`). La surcharge vise `resolveRouteBindingQuery`, par laquelle passent
 * aussi les liaisons imbriquées (`scopeBindings`).
 */
trait RefusesImpossibleRouteKeys
{
    public const ROUTE_KEY_PATTERN = '/^[0-9]{1,18}$/';

    /**
     * @param  Builder|Relation  $query
     * @param  mixed  $value
     * @param  string|null  $field
     */
    public function resolveRouteBindingQuery($query, $value, $field = null)
    {
        $champ = $field ?? $this->getRouteKeyName();
        $colonne = str_contains($champ, '.') ? substr($champ, strrpos($champ, '.') + 1) : $champ;

        if ($colonne === $this->getKeyName()
            && in_array($this->getKeyType(), ['int', 'integer'], true)
            && ! (is_int($value) || (is_string($value) && preg_match(self::ROUTE_KEY_PATTERN, $value) === 1))) {
            return $query->whereRaw('1 = 0');
        }

        return parent::resolveRouteBindingQuery($query, $value, $field);
    }
}
