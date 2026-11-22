<?php

namespace App\Services\Documents;

use App\Http\Responses\PaginationMeta;
use App\Models\Concerns\HasQueryBuilder;
use App\Models\Document;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Support\Str;
use Meilisearch\Endpoints\Indexes;

/**
 * TCK-2769 — la recherche dans le coffre (`GET /api/me/document-vault?filter[search]=`).
 *
 * **Elle ne fait que retenir des entrées du coffre déjà jugé.** {@see DocumentVault::search()} bâtit le
 * coffre de l'appelant par le chemin sans recherche, avec les mêmes règles de lecture : documents
 * internes, règle d'auteur, pièces de profil sous impersonation, dossiers en lecture seule. Cette
 * classe ne retient que des entrées de ce coffre, et le moteur ne lui donne que des identifiants
 * CANDIDATS. Une pièce que le coffre ne rend pas ne peut donc pas être trouvée, quoi que rende le moteur.
 *
 * Ce qui correspond :
 *
 *  - une pièce TÉLÉVERSÉE : la recherche plein texte de Meilisearch (nom, description, tolérance aux
 *    fautes), bornée dans le moteur au périmètre du coffre ({@see self::filtreDuMoteur()}). Ou bien
 *    chaque mot de la requête commence un mot de son nom ou du libellé de son type, celui que l'écran
 *    lit sous le nom : l'index ne cherche pas dans le type ;
 *  - une entrée GÉNÉRÉE : chaque mot de la requête commence un mot de ce que l'écran en montre. C'est
 *    le libellé de sa catégorie, le mois et l'année de sa date, et sa référence.
 *
 * **Le libellé d'une entrée générée vit dans le front** (principe 5, décision de TCK-2769). Le serveur
 * cherche dans `resources/documents/vocabulaire-du-coffre.json`, que le front DÉRIVE de ses messages
 * (`takussan-web/scripts/gen-vocabulaire-du-coffre.mjs`). La suite du front rougit quand le fichier ne
 * suit plus ses libellés. `RechercheDuCoffreVocabulaireTest` rougit quand une catégorie que le coffre
 * émet n'y est pas.
 *
 * Toutes les langues du fichier sont cherchées, quelle que soit celle de l'appelant : « receipt » trouve
 * une quittance pour un appelant francophone. Le gain l'emporte sur le bruit.
 */
class RechercheDuCoffre
{
    public const VOCABULAIRE = 'documents/vocabulaire-du-coffre.json';

    /**
     * Le plafond de candidats que rend le moteur, celui de {@see HasQueryBuilder} (5000). Il est pris
     * DANS le périmètre du coffre, jamais sur l'index entier.
     */
    public const PLAFOND_DU_MOTEUR = 5000;

    /** Les mots-outils de la requête, en français et en anglais, déjà repliés. Liste courte et fermée. */
    private const MOTS_OUTILS = [
        'a', 'au', 'aux', 'd', 'de', 'des', 'du', 'l', 'la', 'le', 'les', 'un', 'une', 'et', 'en',
        'mon', 'ma', 'mes', 'the', 'of', 'an', 'and', 'my',
    ];

    /** @var array{categories: array<string, array<string, string>>, types: array<string, array<string, string>>}|null */
    private static ?array $vocabulaire = null;

    /**
     * Les entrées du coffre qui correspondent à `$q`, aplaties, chacune avec son dossier, plus récentes
     * d'abord, et paginées.
     *
     * @param  list<array<string, mixed>>  $dossiers  `folders` du coffre déjà jugé
     * @param  array<class-string, list<int>>  $cibles  les porteurs dont le coffre lit les documents
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function chercher(array $dossiers, string $q, int $moi, array $cibles, int $page, int $parPage): array
    {
        $termes = self::termes($q);
        $candidats = array_flip($this->candidatsDuMoteur($q, $moi, $cibles));

        $trouvees = [];
        foreach ($dossiers as $dossier) {
            $leDossier = [
                'key' => $dossier['key'],
                'kind' => $dossier['kind'],
                'name' => $dossier['name'] ?? null,
                'year' => $dossier['year'] ?? null,
                'read_only' => (bool) ($dossier['read_only'] ?? false),
            ];
            foreach ($dossier['entries'] as $entree) {
                $retenue = $entree['kind'] === DocumentVault::KIND_UPLOADED
                    ? isset($candidats[(int) $entree['document_id']]) || $this->correspond($termes, $this->motsDeLaPiece($entree))
                    : $this->correspond($termes, $this->motsDuGenere($entree));
                if ($retenue) {
                    $trouvees[] = $entree + ['folder' => $leDossier];
                }
            }
        }

        // Plus récentes d'abord ; l'ordre du coffre départage (tri stable).
        usort($trouvees, fn (array $a, array $b): int => strcmp((string) ($b['date'] ?? ''), (string) ($a['date'] ?? '')));

        return [
            'data' => array_slice($trouvees, ($page - 1) * $parPage, $parPage),
            'meta' => PaginationMeta::of(total: count($trouvees), perPage: $parPage, currentPage: $page),
        ];
    }

    /**
     * Les identifiants que le moteur trouve pour `$q`, dans le périmètre du coffre seulement.
     *
     * @param  array<class-string, list<int>>  $cibles
     * @return list<int>
     */
    private function candidatsDuMoteur(string $q, int $moi, array $cibles): array
    {
        $filtre = self::filtreDuMoteur($moi, $cibles);

        return Document::search($q, function ($index, $query, array $options) use ($filtre) {
            // Les moteurs Eloquent de Scout (`collection`, `database`) ne connaissent pas ce filtre :
            // aucun n'est employé (`SCOUT_DRIVER=meilisearch` partout), et le coffre retient de toute
            // façon ses seules entrées.
            if ($index instanceof EloquentBuilder) {
                return $index;
            }

            $options['filter'] = $filtre;

            return $this->interroger($index, (string) $query, $options);
        })
            ->options(['attributesToRetrieve' => ['id']])
            ->take(self::PLAFOND_DU_MOTEUR)
            ->keys()
            ->map(fn ($id): int => (int) $id)
            ->all();
    }

    /**
     * L'appel au moteur, isolé pour qu'un test lise le filtre envoyé.
     *
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    protected function interroger(Indexes $index, string $query, array $options): array
    {
        return $index->rawSearch($query, $options);
    }

    /**
     * Le périmètre du coffre, dit au moteur : les porteurs qu'il lit, plus les téléversements de
     * l'appelant (la règle d'auteur). C'est un SUR-ensemble du coffre : le coffre retient ensuite ses
     * seules entrées. Sa taille suit le nombre de porteurs du coffre, jamais celui des documents. Il ne
     * nomme que `documentable_type`, `documentable_id` et `uploaded_by`, filtrables depuis TCK-2655.
     *
     * @param  array<class-string, list<int>>  $cibles
     */
    public static function filtreDuMoteur(int $moi, array $cibles): string
    {
        $clauses = [];
        foreach ($cibles as $classe => $ids) {
            if ($ids !== []) {
                $clauses[] = '(documentable_type = '.self::chaine($classe).' AND documentable_id IN ['.implode(', ', array_map('intval', $ids)).'])';
            }
        }
        $clauses[] = "uploaded_by = {$moi}";

        return implode(' OR ', $clauses);
    }

    /**
     * Les mots de la requête, repliés (casse et accents), sans mots-outils ni doublons.
     *
     * @return list<string>
     */
    public static function termes(string $q): array
    {
        return array_values(array_unique(array_diff(self::mots($q), self::MOTS_OUTILS)));
    }

    /**
     * Vrai quand chaque terme commence un mot de `$mots`. Une requête faite des seuls mots-outils ne
     * retient aucune entrée de cette façon.
     *
     * @param  list<string>  $termes
     * @param  list<string>  $mots
     */
    private function correspond(array $termes, array $mots): bool
    {
        if ($termes === []) {
            return false;
        }
        foreach ($termes as $terme) {
            $trouve = false;
            foreach ($mots as $mot) {
                if (str_starts_with($mot, $terme)) {
                    $trouve = true;
                    break;
                }
            }
            if (! $trouve) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $entree
     * @return list<string>
     */
    private function motsDeLaPiece(array $entree): array
    {
        $type = (string) ($entree['category'] ?? '');

        return [
            ...self::mots((string) ($entree['title'] ?? '')),
            ...self::mots(implode(' ', self::vocabulaire()['types'][$type] ?? [])),
        ];
    }

    /**
     * Ce que l'écran montre d'une entrée générée : le libellé de sa catégorie, le mois et l'année de sa
     * date (la quittance d'octobre, le relevé d'août 2026), et sa référence.
     *
     * @param  array<string, mixed>  $entree
     * @return list<string>
     */
    private function motsDuGenere(array $entree): array
    {
        $vocabulaire = self::vocabulaire();
        $libelles = $vocabulaire['categories'][(string) ($entree['category'] ?? '')] ?? [];
        $mots = [...self::mots(implode(' ', $libelles)), ...self::mots((string) ($entree['title'] ?? ''))];

        $date = $entree['date'] ?? null;
        if (is_string($date) && $date !== '') {
            $jour = CarbonImmutable::parse($date);
            $mots[] = $jour->format('Y');
            foreach (array_keys($libelles) as $langue) {
                array_push($mots, ...self::mots($jour->locale($langue)->translatedFormat('F')));
            }
        }

        return $mots;
    }

    /**
     * Repli de casse et d'accents, puis découpage sur tout ce qui n'est ni lettre ni chiffre :
     * « Quittance d’Août » → `quittance`, `d`, `aout`.
     *
     * @return list<string>
     */
    private static function mots(string $texte): array
    {
        return array_values(array_filter(
            preg_split('/[^a-z0-9]+/', Str::lower(Str::ascii($texte))) ?: [],
            fn (string $mot): bool => $mot !== '',
        ));
    }

    /** @return array{categories: array<string, array<string, string>>, types: array<string, array<string, string>>} */
    public static function vocabulaire(): array
    {
        if (self::$vocabulaire === null) {
            $lu = json_decode((string) file_get_contents(resource_path(self::VOCABULAIRE)), true, flags: JSON_THROW_ON_ERROR);
            self::$vocabulaire = [
                'categories' => (array) ($lu['categories'] ?? []),
                'types' => (array) ($lu['types'] ?? []),
            ];
        }

        return self::$vocabulaire;
    }

    /** Une chaîne de filtre Meilisearch : `\` et `"` s'échappent (« App\\Models\\Lease »). */
    private static function chaine(string $valeur): string
    {
        return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $valeur).'"';
    }
}
