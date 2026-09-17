<?php

namespace Tests\Unit\Lang;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-536 — `lang/fr` et `lang/wo` portent TOUTES les clés de validation.
 *
 * Mesuré le 2026-09-17 : les deux fichiers n'en portaient que 12 des 117 de Laravel 13, et aucun
 * nom de champ. `fallback_locale` valant `en`, une règle absente ne lève rien — elle sort en
 * anglais au milieu d'une phrase française, et aucun test ne le voit tant qu'il n'asserte pas la
 * prose exacte. D'où une garde sur les CLÉS, qui ne dépend d'aucun message.
 *
 * Référence : le dictionnaire du framework (les règles) plus `lang/en/validation.php` (les clés
 * propres au dépôt). Les placeholders (`:attribute`, `:date`…) sont comparés aussi : une
 * traduction qui en perd un rend un message à trou, sans erreur.
 */
class ValidationTranslationParityTest extends TestCase
{
    private const LOCALES_TRADUITES = ['fr', 'wo'];

    /** Blocs dont le contenu est propre à chaque langue, ou gabarit du framework. */
    private const BLOCS_LIBRES = ['custom', 'attributes', 'values'];

    /** @return iterable<string, array{string}> */
    public static function locales(): iterable
    {
        foreach (self::LOCALES_TRADUITES as $locale) {
            yield $locale => [$locale];
        }
    }

    #[DataProvider('locales')]
    public function test_chaque_regle_du_framework_et_du_depot_est_traduite(string $locale): void
    {
        $traduit = $this->aplatir($this->charger("lang/{$locale}/validation.php"));
        $reference = $this->reference();

        $this->assertNotEmpty($reference, 'La référence est vide : la garde ne regarderait rien.');
        $manquantes = array_diff(array_keys($reference), array_keys($traduit));

        $this->assertSame([], array_values($manquantes), "Clés de validation absentes de lang/{$locale} (elles sortiraient en anglais).");
    }

    #[DataProvider('locales')]
    public function test_les_placeholders_sont_conserves(string $locale): void
    {
        $traduit = $this->aplatir($this->charger("lang/{$locale}/validation.php"));
        $ecarts = [];

        foreach ($this->reference() as $cle => $message) {
            if (! isset($traduit[$cle])) {
                continue;
            }
            $attendus = $this->placeholders($message);
            $obtenus = $this->placeholders($traduit[$cle]);
            if ($attendus !== $obtenus) {
                $ecarts[$cle] = implode(',', $attendus).' ≠ '.implode(',', $obtenus);
            }
        }

        $this->assertSame([], $ecarts, "Placeholders divergents dans lang/{$locale}/validation.php.");
    }

    public function test_fr_et_wo_ont_les_memes_cles_y_compris_les_noms_de_champs(): void
    {
        $fr = array_keys($this->aplatir($this->charger('lang/fr/validation.php'), false));
        $wo = array_keys($this->aplatir($this->charger('lang/wo/validation.php'), false));
        sort($fr);
        sort($wo);

        $this->assertContains('attributes.end_date', $fr);
        $this->assertSame($fr, $wo);
    }

    /** @return array<string, string> */
    private function reference(): array
    {
        return $this->aplatir($this->charger('vendor/laravel/framework/src/Illuminate/Translation/lang/en/validation.php'))
            + $this->aplatir($this->charger('lang/en/validation.php'));
    }

    /** @return array<string, mixed> */
    private function charger(string $chemin): array
    {
        return require dirname(__DIR__, 3).'/'.$chemin;
    }

    /**
     * @param  array<string, mixed>  $arbre
     * @return array<string, string>
     */
    private function aplatir(array $arbre, bool $sansBlocsLibres = true, string $prefixe = ''): array
    {
        $plat = [];
        foreach ($arbre as $cle => $valeur) {
            if ($sansBlocsLibres && $prefixe === '' && in_array($cle, self::BLOCS_LIBRES, true)) {
                continue;
            }
            if (is_array($valeur)) {
                $plat += $this->aplatir($valeur, $sansBlocsLibres, $prefixe.$cle.'.');
            } else {
                $plat[$prefixe.$cle] = (string) $valeur;
            }
        }

        return $plat;
    }

    /** @return list<string> */
    private function placeholders(string $message): array
    {
        preg_match_all('/:[a-z_]+/', $message, $m);
        $uniques = array_values(array_unique($m[0]));
        sort($uniques);

        return $uniques;
    }
}
