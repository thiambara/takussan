<?php

namespace App\Services\Search;

use App\Models\Document;
use App\Models\User;
use App\Policies\DocumentPolicy;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;

class DocumentSearchService
{
    /**
     * @param  array<string, mixed>  $params  Validated search parameters
     */
    public function search(User $user, array $params): LengthAwarePaginator
    {
        // Scope + equality filters run as native Scout clauses so the search
        // engine filters and paginates server-side — yielding a correct total.
        $search = Document::search($params['q']);

        // Scoping: non-admin users see only their own uploaded documents.
        if (! $user->isSuperAdmin()) {
            $search->where('uploaded_by', $user->id);
        }

        // TCK-2759 (r4, vérification de 90250c936) — la recherche suit la lecture (ADR-0099 § 1) : un
        // téléversement que `view()` refuse n'y passe pas — celui du personnel parti (règle d'auteur,
        // TCK-2295), et un document interne hors de son lecteur (le téléverseur suspendu, le sujet de
        // la fiche, même super-admin). L'écart est calculé en SQL par les formes de la liste, et passé
        // au moteur : le total et les pages restent justes.
        $exclus = $this->exclus($user);
        if ($exclus !== []) {
            $search->whereNotIn('id', $exclus);
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
     * Les documents que le périmètre du moteur laisserait passer et que la lecture refuse : parmi
     * ses téléversements, ceux que {@see DocumentPolicy::restreindreAuTeleverseur()} retire ; pour le
     * super-admin, les internes que {@see DocumentPolicy::restreindreAuxLecteursDInternes()} retire
     * (ceux d'une fiche dont il est le sujet). L'écart, jamais le périmètre — mais non borné : pour le
     * personnel parti, ce sont tous ses téléversements dans l'agence quittée, passés en un seul `NOT id IN`.
     *
     * @return list<int>
     */
    private function exclus(User $user): array
    {
        $perimetre = $user->isSuperAdmin()
            ? Document::query()->where('is_internal', true)
            : Document::query()->where('uploaded_by', $user->id);
        $lus = $user->isSuperAdmin()
            ? DocumentPolicy::restreindreAuxLecteursDInternes(Document::query(), $user)
            : DocumentPolicy::restreindreAuTeleverseur(Document::query(), $user);

        return $perimetre->whereNotIn('id', $lus->select('documents.id'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
    }
}
