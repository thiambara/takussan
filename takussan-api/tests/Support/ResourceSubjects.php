<?php

namespace Tests\Support;

use App\Http\Resources\Accounting\MatchCandidateResource;
use App\Http\Resources\Api\Admin\AgencyProvisioningResource;
use App\Http\Resources\Api\Admin\ModerationItemResource;
use App\Http\Resources\DocumentVersionResource;
use App\Http\Resources\MediaResource;
use App\Models\Agency;
use App\Models\Document;
use App\Models\User;
use App\Services\Accounting\MatchCandidate;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Schema;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * Fabrique le SUJET d'une ressource, hydraté avec des dates connues — TCK-327, AC2.
 *
 * L'énumération vit dans {@see ResourceInventory} ; ici on construit ce qu'elle a nommé. La
 * séparation n'est pas cosmétique : l'énumération doit rester lisible sans base de données (les
 * `#[DataProvider]` s'exécutent avant le conteneur), la fabrication exige la base.
 *
 * **Les dates ne sont pas devinées : elles sont lues dans le conteneur.** `getCasts()` donne le
 * type déclaré de chaque colonne, `getDates()` donne les horodatages implicites. On écrit
 * l'instant de référence sur tout ce qui est `datetime`, le jour de référence sur tout ce qui est
 * `date`, et l'on regarde ensuite ce que la ressource en fait. Aucune liste de champs n'est
 * recopiée : c'est très exactement la propriété qui manquait à AC2.
 *
 * ⚠ **Ce que la fabrication ne peut pas atteindre, et qu'il faut savoir en lisant un vert.**
 * 29 sites `whenLoaded()` dans 14 fichiers (mesuré le 2026-08-22 :
 * `grep -rn "whenLoaded(" app/Http/Resources | wc -l`) n'émettent leur clé que si la relation est
 * CHARGÉE. {@see self::chargerLesRelationsCitees()} en charge autant que le sujet le permet — les
 * noms sont extraits du source de la ressource, jamais listés à la main — mais une relation sans
 * ligne en base reste absente de la sortie, et ce qu'elle aurait émis n'est alors pas mesuré.
 */
final class ResourceSubjects
{
    /** L'instant de référence, et sa seule écriture licite sur le fil. */
    public const INSTANT = '2026-08-17 12:34:56';

    /** Le jour calendaire de référence, et sa seule écriture licite sur le fil. */
    public const JOUR = '2026-08-17';

    /**
     * Les sujets d'une ressource, étiquetés pour que le message d'échec les nomme.
     *
     * @return array<string,mixed>
     */
    public static function pour(string $resource): array
    {
        if (array_key_exists($resource, ResourceInventory::SUJETS_SUR_MESURE)) {
            return self::surMesure($resource);
        }

        $sujets = [];

        foreach (ResourceInventory::modelesPour($resource) as $modele) {
            $sujets[class_basename($modele)] = self::modele($modele, $resource);
        }

        return $sujets;
    }

    /**
     * Un modèle hydraté : par sa factory quand elle existe, sinon par une instance NON PERSISTÉE
     * dont toutes les colonnes sont présentes.
     *
     * Le second cas n'est pas un pis-aller : cinq modèles du dépôt n'ont pas de factory
     * (`Announcement`, `AgencySubscription`, `Plan`, `DataExport`, `KycDossier`), et TCK-327 les
     * comptait comme non énumérables. Remplir toutes les colonnes à `null` rend `whenHas()`
     * satisfait — la clé est PRÉSENTE — sans inventer de valeur : c'est ce qui permet d'éprouver
     * la forme des dates qu'on y écrit ensuite.
     */
    private static function modele(string $modele, string $resource): Model
    {
        /** @var Model $instance */
        if (self::aUneFactory($modele)) {
            $instance = $modele::factory()->create()->refresh();
        } else {
            $instance = new $modele;
            $colonnes = Schema::getColumnListing($instance->getTable());
            $instance->setRawAttributes(array_fill_keys($colonnes, null));
            $instance->setAttribute($instance->getKeyName(), 1);
        }

        self::hydraterLesDates($instance);
        self::chargerLesRelationsCitees($instance, $resource);

        return $instance;
    }

    private static function aUneFactory(string $modele): bool
    {
        return method_exists($modele, 'factory')
            && class_exists(Factory::resolveFactoryName($modele));
    }

    /**
     * Écrit l'instant/le jour de référence sur TOUTE colonne dont le conteneur dit qu'elle est
     * une date. Rien n'est deviné à partir du nom.
     */
    public static function hydraterLesDates(Model $modele): void
    {
        foreach ($modele->getCasts() as $attribut => $cast) {
            $type = strtolower((string) strtok((string) $cast, ':'));

            if (in_array($type, ['date', 'immutable_date'], true)) {
                $modele->setAttribute($attribut, Carbon::parse(self::JOUR, 'UTC'));
            } elseif (in_array($type, ['datetime', 'immutable_datetime', 'timestamp', 'custom_datetime'], true)) {
                $modele->setAttribute($attribut, Carbon::parse(self::INSTANT, 'UTC'));
            }
        }

        foreach ($modele->getDates() as $attribut) {
            $modele->setAttribute($attribut, Carbon::parse(self::INSTANT, 'UTC'));
        }
    }

    /**
     * Charge les relations que le SOURCE de la ressource cite, et hydrate leurs dates.
     *
     * Les noms sont extraits du fichier — `whenLoaded('x')`, `relationLoaded('x')`, `load('x')` —
     * et non listés ici : une liste écrite à la main divergerait au premier `whenLoaded` ajouté,
     * et le dispositif perdrait de la portée sans rien faire rougir.
     *
     * Une relation singulière qui se charge à `null` est LAISSÉE CHARGÉE, et c'est le choix sûr :
     * `whenLoaded()` rend alors `null` — jamais un `MissingValue` — donc la ressource émet la clé
     * à `null` au lieu de déréférencer un objet fantôme. La décharger reproduirait au contraire le
     * cas « relation absente », que 29 sites `whenLoaded` traitent déjà et que ce parcours
     * n'atteint de toute façon pas.
     */
    private static function chargerLesRelationsCitees(Model $modele, string $resource): void
    {
        if (! $modele->exists) {
            self::greffherLesRelationsCitees($modele, $resource);

            return;
        }

        foreach (self::relationsCitees($resource) as $relation) {
            if (! method_exists($modele, $relation)) {
                continue;
            }

            try {
                $modele->loadMissing($relation);
            } catch (Throwable) {
                $modele->unsetRelation($relation);

                continue;
            }

            if (! $modele->relationLoaded($relation)) {
                // Une clé étrangère nulle laisse `loadMissing()` sans rien poser : on greffe.
                self::greffer($modele, $relation);

                continue;
            }

            $valeur = $modele->getRelation($relation);

            if ($valeur === null || ($valeur instanceof EloquentCollection && $valeur->isEmpty())) {
                self::greffer($modele, $relation);
                $valeur = $modele->getRelation($relation);
            }

            if ($valeur instanceof Model) {
                self::hydraterLesDates($valeur);
            } elseif ($valeur instanceof EloquentCollection) {
                $valeur->each(fn ($lie) => $lie instanceof Model ? self::hydraterLesDates($lie) : null);
            }
        }
    }

    /**
     * Sur un sujet NON PERSISTÉ, aucune relation ne peut se charger depuis la base : on GREFFE une
     * instance vide du modèle lié, dates hydratées.
     *
     * Sans cela, les cinq modèles sans factory n'atteindraient aucune de leurs branches
     * `whenLoaded` — et c'est justement là que vivent les dates imbriquées, celles que
     * `resolve()` ne filtre pas et qu'un parcours non récursif rate.
     */
    private static function greffherLesRelationsCitees(Model $modele, string $resource): void
    {
        foreach (self::relationsCitees($resource) as $nom) {
            if (! method_exists($modele, $nom)) {
                continue;
            }

            try {
                $relation = $modele->{$nom}();
            } catch (Throwable) {
                continue;
            }

            if (! $relation instanceof Relation) {
                continue;
            }

            self::greffer($modele, $nom);
        }
    }

    private static function greffer(Model $modele, string $nom): void
    {
        try {
            $relation = $modele->{$nom}();
        } catch (Throwable) {
            return;
        }

        if (! $relation instanceof Relation) {
            return;
        }

        $lie = $relation->getRelated()->newInstance();
        $lie->setRawAttributes(array_fill_keys(Schema::getColumnListing($lie->getTable()), null));
        $lie->setAttribute($lie->getKeyName(), 1);
        self::hydraterLesDates($lie);

        $modele->setRelation(
            $nom,
            $relation instanceof BelongsTo || $relation instanceof HasOne || $relation instanceof MorphOne || $relation instanceof MorphTo
                ? $lie
                : new EloquentCollection([$lie]),
        );
    }

    /** @return array<int,string> */
    private static function relationsCitees(string $resource): array
    {
        $chemin = __DIR__.'/../../app/Http/Resources/'
            .str_replace('\\', '/', substr($resource, strlen('App\\Http\\Resources\\'))).'.php';

        if (! is_file($chemin)) {
            return [];
        }

        preg_match_all(
            "/(?:whenLoaded|relationLoaded|loadMissing|->load)\(\s*'([A-Za-z0-9_.]+)'/",
            (string) file_get_contents($chemin),
            $trouves,
        );

        return array_values(array_unique($trouves[1] ?? []));
    }

    /**
     * Les cinq ressources qu'aucun modèle n'adosse. Chaque recette reproduit ce que la couche
     * appelante passe RÉELLEMENT — c'est le seul point où la fabrication a le droit d'écrire des
     * valeurs, et écrire autre chose que la réalité ferait mesurer un contrat imaginaire.
     *
     * @return array<string,mixed>
     */
    private static function surMesure(string $resource): array
    {
        return match ($resource) {
            MatchCandidateResource::class => [
                // `PaymentSearchService` passe `$p->paid_at?->toDateString()` : le DTO reçoit DÉJÀ
                // une date tronquée. On lui donne donc exactement cela, et non un instant — sans
                // quoi ce test mesurerait une ressource que le dépôt n'exécute pas.
                'DTO' => new MatchCandidate(
                    id: 1,
                    type: 'booking_payment',
                    label: 'Paiement de réservation',
                    amount: '150000.00',
                    currency: 'XOF',
                    reference: 'REF-2026-08',
                    paidAt: self::JOUR,
                    payerName: 'Awa Ndiaye',
                ),
            ],
            ModerationItemResource::class => [
                // Exactement ce que rend le pilote PDO sur les colonnes `timestamp` du `selectRaw`
                // unifié : des CHAÎNES, jamais passées par un cast Eloquent.
                'selectRaw' => [
                    'id' => 'property:1',
                    'type' => 'property',
                    'status' => 'pending',
                    'subject_type' => 'property',
                    'subject_id' => 1,
                    'subject' => null,
                    'reporter' => null,
                    'agency' => null,
                    'reason' => 'Bien en attente de validation',
                    'reported_count' => 0,
                    'reported_at' => self::INSTANT,
                    'created_at' => self::INSTANT,
                ],
            ],
            AgencyProvisioningResource::class => [
                'tableau' => [
                    'agency' => tap(Agency::factory()->create(), self::hydraterLesDates(...)),
                    'admin' => tap(User::factory()->create(), self::hydraterLesDates(...)),
                ],
            ],
            MediaResource::class,
            DocumentVersionResource::class => [
                'Media' => self::media(),
            ],
            default => [],
        };
    }

    /**
     * Un `Spatie\…\Media` non persisté : le paquet n'offre pas de factory, et le persister
     * exigerait un fichier sur disque que la forme des dates ne demande pas.
     */
    private static function media(): Media
    {
        $media = new Media;
        $media->setRawAttributes([
            'id' => 1,
            'model_type' => Document::class,
            'model_id' => 1,
            'uuid' => '00000000-0000-4000-8000-000000000001',
            'collection_name' => 'versions',
            'name' => 'contrat',
            'file_name' => 'contrat.pdf',
            'mime_type' => 'application/pdf',
            'disk' => 'public',
            'conversions_disk' => 'public',
            'size' => 1024,
            'manipulations' => '[]',
            'custom_properties' => json_encode([
                'is_active' => true,
                'version_number' => 3,
                'comment' => 'Version signée',
                'uploaded_by_id' => 1,
            ]),
            'generated_conversions' => '[]',
            'responsive_images' => '[]',
            'order_column' => 1,
        ]);

        self::hydraterLesDates($media);

        return $media;
    }
}
