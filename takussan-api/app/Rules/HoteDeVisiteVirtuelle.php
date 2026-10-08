<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-598 (V19, contrainte 13) — l'hôte d'une visite virtuelle appartient à la liste
 * d'autorisation de `config/catalogue.php`, par comparaison EXACTE.
 *
 * Il n'y a pas de CSP sur le front (`next.config.ts`) : cette liste est la seule barrière contre
 * l'intégration d'une page arbitraire dans la fiche. D'où trois refus que la règle `url` seule ne
 * pose pas :
 *
 *   · un SUFFIXE n'est pas l'hôte : `evilyoutube.com`, `youtube.com.evil.test` sont refusés ;
 *   · les identifiants d'URL ne trompent pas : `https://youtube.com@evil.test/` a pour hôte
 *     `evil.test` (`parse_url`), refusé ;
 *   · le schéma est `https` seul (la règle `url:https` à côté), `javascript:` n'a pas d'hôte ;
 *   · AUCUNE information d'utilisateur, même sur un hôte autorisé (verif-598, m9) :
 *     `https://user:pw@www.youtube.com/…` était accepté, et le front ne l'affiche jamais.
 */
class HoteDeVisiteVirtuelle implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || $value === '') {
            return;
        }

        if (parse_url($value, PHP_URL_USER) !== null || parse_url($value, PHP_URL_PASS) !== null) {
            $fail(__('validation.rules.virtual_tour_host'));

            return;
        }

        $hote = parse_url($value, PHP_URL_HOST);
        $autorises = array_map('strtolower', (array) config('catalogue.virtual_tour_hosts', []));

        if (! is_string($hote) || ! in_array(strtolower($hote), $autorises, true)) {
            $fail(__('validation.rules.virtual_tour_host'));
        }
    }
}
