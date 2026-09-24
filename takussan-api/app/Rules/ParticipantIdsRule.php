<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-565 — la FORME d'une liste de participants d'une conversation (`participants`, `user_ids`) :
 * des identifiants entiers, sans doublon si on le demande. Une seule erreur, portée par la LISTE.
 *
 * Retour testeur du 2026-09-23 (M13) : « The selected participants.0 is invalid. (and 1 more
 * error) ». Toute règle écrite sur `participants.*` produit une erreur PAR POSITION, nommée d'après
 * l'index du tableau — un nom de champ qui ne dit rien à l'utilisateur, et autant d'erreurs que de
 * positions en échec, donc le résumé « (and N more error) » du framework. La première correction
 * avait retiré `exists` de `participants.*` mais y avait laissé `integer` et `distinct` : la même
 * forme revenait avec `participants=["abc","def"]` (relevé du vérificateur, 2026-09-23).
 *
 * Cette règle se pose sur la liste elle-même, après `bail|array` : elle ne peut produire qu'UNE
 * erreur, sur la clé de la liste. L'existence et la joignabilité des comptes sont vérifiées
 * ensuite, une fois pour tout le tableau, par le `withValidator()` de chaque requête.
 */
class ParticipantIdsRule implements ValidationRule
{
    public function __construct(private readonly bool $distinct = false) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_array($value)) {
            return; // `array` l'a déjà refusée, et `bail` arrête avant d'arriver ici.
        }

        foreach ($value as $id) {
            if (! self::isId($id)) {
                $fail(__('messaging.errors.participants_unavailable'));

                return;
            }
        }

        if ($this->distinct && count(array_unique(array_map('intval', $value))) !== count($value)) {
            $fail(__('messaging.errors.participants_duplicate'));
        }
    }

    /** Un entier strictement positif, en nombre ou en chaîne décimale (JSON comme formulaire). */
    private static function isId(mixed $id): bool
    {
        if (is_int($id)) {
            return $id > 0;
        }

        return is_string($id) && preg_match('/^[1-9]\d{0,18}$/', $id) === 1;
    }
}
