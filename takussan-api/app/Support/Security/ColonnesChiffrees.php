<?php

namespace App\Support\Security;

use Illuminate\Database\Eloquent\Model;
use ReflectionClass;
use Symfony\Component\Finder\Finder;

/**
 * TCK-614 (ADR-0084, amendement du 2026-11-16) — les colonnes chiffrées, DÉRIVÉES des casts des modèles, jamais
 * écrites à la main : un modèle ajouté demain avec un cast chiffré entre dans `security:reencrypt` et
 * `backup:verify-encryption` sans qu'on les modifie.
 *
 * Est chiffrée une colonne dont le cast commence par `encrypted` (`encrypted`, `encrypted:array`,
 * `encrypted:collection`, `encrypted:object`) ou dont la classe de cast s'appelle `AsEncrypted…`
 * (`AsEncryptedArrayObject`, `AsEncryptedCollection`). Tous stockent la chaîne de `Crypt::encryptString()`.
 *
 * Les racines balayées sont injectables (dossier => espace de noms) : c'est ainsi qu'un test y ajoute un modèle de
 * fixture. Le conteneur rend par défaut `app/Models`.
 */
class ColonnesChiffrees
{
    /** @param  array<string, string>  $racines  dossier => espace de noms */
    public function __construct(private readonly array $racines = []) {}

    /**
     * Chaque modèle concret qui porte au moins une colonne chiffrée, et ses colonnes, triés.
     *
     * @return array<class-string<Model>, list<string>>
     */
    public function parModele(): array
    {
        $racines = $this->racines !== [] ? $this->racines : [app_path('Models') => 'App\\Models\\'];
        $modeles = [];
        foreach ($racines as $dossier => $espace) {
            foreach (Finder::create()->files()->in($dossier)->name('*.php') as $fichier) {
                $classe = rtrim($espace, '\\').'\\'.str_replace(['/', '.php'], ['\\', ''], $fichier->getRelativePathname());
                if (! class_exists($classe) || ! is_subclass_of($classe, Model::class) || (new ReflectionClass($classe))->isAbstract()) {
                    continue;
                }
                $colonnes = [];
                foreach ((new $classe)->getCasts() as $colonne => $cast) {
                    if (self::estChiffre($cast)) {
                        $colonnes[] = (string) $colonne;
                    }
                }
                if ($colonnes !== []) {
                    sort($colonnes);
                    $modeles[$classe] = $colonnes;
                }
            }
        }
        ksort($modeles);

        return $modeles;
    }

    public static function estChiffre(mixed $cast): bool
    {
        if (! is_string($cast)) {
            return false;
        }
        $classe = explode(':', $cast, 2)[0];

        return str_starts_with($cast, 'encrypted') || str_starts_with(class_basename($classe), 'AsEncrypted');
    }
}
