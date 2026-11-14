<?php

namespace App\Services\Search;

use App\Models\Customer;
use App\Models\Document;
use App\Models\User;
use App\Policies\DocumentPolicy;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Support\Carbon;
use Laravel\Scout\Builder as ScoutBuilder;
use Meilisearch\Endpoints\Indexes;

class DocumentSearchService
{
    /**
     * @param  array<string, mixed>  $params  Validated search parameters
     */
    public function search(User $user, array $params): LengthAwarePaginator
    {
        // TCK-2759 (r4), puis TCK-2781 — la recherche suit la lecture (ADR-0099 § 1) : un téléversement
        // que `view()` refuse n'y passe pas — celui du personnel parti (règle d'auteur, TCK-2295), et un
        // document interne hors de son lecteur (le téléverseur suspendu, le sujet de la fiche, même
        // super-admin). La règle se dit au moteur par un filtre borné par les AGENCES du lecteur
        // ({@see self::filtreDeLecture()}), dans la requête même : le total et les pages restent justes.
        $lecture = $this->filtreDeLecture($user);
        $search = Document::search($params['q'], function ($index, $query, $options) use ($user, $lecture) {
            // Les moteurs `collection` et `database` rappellent avec la requête Eloquent, et ne posent
            // alors aucune clause du builder : la règle SQL elle-même, qui est la référence, s'y pose.
            if ($index instanceof EloquentBuilder && $query instanceof ScoutBuilder) {
                $this->restreindreEnSql($index, $query, $user);

                return $index;
            }

            $scout = (string) ($options['filter'] ?? '');
            $options['filter'] = $scout !== '' ? "({$scout}) AND {$lecture}" : $lecture;

            return $this->interroger($index, (string) $query, $options);
        });

        // Défense en profondeur (TCK-2781) — le filtre du moteur lit l'index, qui peut être en retard sur la
        // base : sous `SCOUT_QUEUE=true`, une pièce passée interne, ou dont le porteur a changé d'agence, y
        // garde ses anciens faits jusqu'à ce que la file la réindexe. Les résultats hydratés repassent donc
        // par la règle SQL de référence : un document que `view()` refuse ne sort jamais, quel que soit
        // l'état de l'index. Pendant ce retard, une page peut compter moins de lignes que `per_page`. Le total,
        // lui, est recompté par Scout en SQL sur les identifiants que rend le moteur (au plus `maxTotalHits`,
        // et seulement quand le résultat tient sur plusieurs pages) : il ignore un document devenu lisible
        // que l'index ne connaît pas encore.
        $search->query(fn (EloquentBuilder $query) => $this->restreindreLaLecture($query, $user));

        // Scoping: non-admin users see only their own uploaded documents.
        if (! $user->isSuperAdmin()) {
            $search->where('uploaded_by', $user->id);
        }

        if (! empty($params['filter']['type'])) {
            $search->where('type', $params['filter']['type']);
        }

        if (($params['sort'] ?? null) === '-created_at') {
            $search->orderBy('created_at', 'desc');
        }

        // TCK-786 (P16.05) — la plage de dates filtre DANS le moteur, comme le périmètre :
        // passée en SQL par `query()`, elle s'appliquait à une page déjà découpée par
        // Meilisearch (pages vides, correspondances inatteignables). `created_at` est indexé
        // en timestamp et filtrable ; les bornes restent inclusives au jour, comme `whereDate`.
        if (! empty($params['filter']['date_from'])) {
            $search->where('created_at', '>=', Carbon::parse($params['filter']['date_from'])->startOfDay()->timestamp);
        }

        if (! empty($params['filter']['date_to'])) {
            $search->where('created_at', '<=', Carbon::parse($params['filter']['date_to'])->endOfDay()->timestamp);
        }

        $paginator = $search->paginate((int) ($params['per_page'] ?? 20));
        $paginator->getCollection()->loadMissing('media');

        return $paginator;
    }

    /**
     * TCK-2781 — la traduction, en filtre Meilisearch, de la forme SQL de la lecture :
     * {@see DocumentPolicy::restreindreAuTeleverseur()} pour qui n'est pas super-admin (le moteur est
     * déjà borné à `uploaded_by`), {@see DocumentPolicy::restreindreAuxLecteursDInternes()} pour le
     * super-admin. Elle lit les faits du porteur recopiés dans l'index (`Document::porteurPourLIndex`),
     * l'agence du personnel ACTIF du lecteur et ses agences gardées : sa taille dépend du nombre
     * d'agences du lecteur, jamais de son nombre de documents. `RechercheDocumentsPariteSqlMoteurTest`
     * garde la traduction contre la règle SQL.
     *
     * Un document indexé avant ces attributs (index non réimporté) n'a ni `is_internal`, ni
     * `carrier_agency_id`, ni `carrier_present` : aucune branche ne le laisse passer.
     */
    public function filtreDeLecture(User $user): string
    {
        $moi = (int) $user->id;
        $fiche = self::chaine((new Customer)->getMorphClass());

        // `subject_user_id != X` passe aussi quand le sujet est nul : `whereNull(user_id) OR user_id != X`.
        if ($user->isSuperAdmin()) {
            return "(is_internal = false OR (documentable_type = {$fiche} AND carrier_present = true AND subject_user_id != {$moi}))";
        }

        $agence = $user->staffAgencyId();
        $internes = $agence === null
            ? 'is_internal = false'
            : "is_internal = false OR (documentable_type = {$fiche} AND carrier_agency_id = {$agence} AND subject_user_id != {$moi})";

        $gardees = DocumentPolicy::agencesGardeesDuTeleverseur($user);
        $auteur = 'carrier_agency_id IS NULL'
            .($gardees !== [] ? ' OR carrier_agency_id IN ['.implode(', ', $gardees).']' : '')
            ." OR subject_user_id = {$moi}";

        return "({$internes}) AND ({$auteur})";
    }

    /**
     * L'appel au moteur, isolé pour qu'un test lise le filtre réellement envoyé (TCK-2781, AC1).
     *
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    protected function interroger(Indexes $index, string $query, array $options): array
    {
        return $index->rawSearch($query, $options);
    }

    /**
     * Les moteurs Eloquent de Scout : les clauses du builder, puis la règle SQL de la lecture.
     *
     * @param  EloquentBuilder<Document>  $query
     */
    private function restreindreEnSql(EloquentBuilder $query, ScoutBuilder $builder, User $user): void
    {
        foreach ($builder->wheres as $where) {
            if ($where['field'] === '__soft_deleted') {
                continue;
            }
            $valeur = $where['field'] === 'created_at' ? Carbon::createFromTimestamp($where['value']) : $where['value'];
            $query->where($where['field'], $where['operator'], $valeur);
        }

        $this->restreindreLaLecture($query, $user);
    }

    /**
     * La règle SQL de la lecture, la référence : {@see DocumentPolicy::restreindreAuTeleverseur()} (qui
     * borne aussi à `uploaded_by`), ou {@see DocumentPolicy::restreindreAuxLecteursDInternes()} pour le
     * super-admin.
     *
     * @param  EloquentBuilder<Document>  $query
     * @return EloquentBuilder<Document>
     */
    private function restreindreLaLecture(EloquentBuilder $query, User $user): EloquentBuilder
    {
        return $user->isSuperAdmin()
            ? DocumentPolicy::restreindreAuxLecteursDInternes($query, $user)
            : DocumentPolicy::restreindreAuTeleverseur($query, $user);
    }

    /** Une chaîne de filtre Meilisearch : `\` et `"` s'échappent (« App\\Models\\Customer »). */
    private static function chaine(string $valeur): string
    {
        return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $valeur).'"';
    }
}
