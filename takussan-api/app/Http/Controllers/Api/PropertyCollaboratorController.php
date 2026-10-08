<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\DesignatePrimaryCollaboratorRequest;
use App\Http\Requests\Api\StorePropertyCollaboratorRequest;
use App\Http\Requests\Api\UpdatePropertyCollaboratorRequest;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Property\PrimaryAgentDesignator;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PropertyCollaboratorController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorize('view', $property);

        return $this->json($this->collaboratorsPayload($property, $request->user()));
    }

    /**
     * TCK-504 (ADR-0053 §4) — désigne l'agent principal du bien. L'autorisation est celle de la
     * gestion des collaborateurs (`DesignatePrimaryCollaboratorRequest`), le reste — rôle,
     * éligibilité, verrou, journal, invalidation de la fiche — vit dans le service.
     */
    public function designatePrimary(DesignatePrimaryCollaboratorRequest $request, Property $property, PropertyCollaborator $collaborator, PrimaryAgentDesignator $designator): JsonResponse
    {
        abort_if($collaborator->property_id !== $property->id, 404);

        $designator->designate($property, $collaborator, $request->user());

        return $this->json($this->collaboratorsPayload($property, $request->user()));
    }

    public function store(StorePropertyCollaboratorRequest $request, Property $property): JsonResponse
    {

        $data = $request->validated();

        $exists = $property->collaborators()->where('user_id', $data['user_id'])->exists();
        abort_code_if($exists, 422, 'property.collaborator_exists');

        $collaborator = DB::transaction(function () use ($property, $data) {
            $this->assertCommissionWithinCapLocked(
                $property,
                (float) ($data['commission_share'] ?? 0),
            );

            return $property->collaborators()->create(array_merge($data, [
                'invited_at' => now(),
            ]));
        });

        return $this->json(['data' => $collaborator->load('user')], 201);
    }

    public function update(UpdatePropertyCollaboratorRequest $request, Property $property, PropertyCollaborator $collaborator): JsonResponse
    {
        abort_if($collaborator->property_id !== $property->id, 404);

        $data = $request->validated();

        $collaborator = DB::transaction(function () use ($property, $collaborator, $data) {
            $collaborator = $this->relireSousLeVerrouDuBien($property, $collaborator);

            if (array_key_exists('commission_share', $data)) {
                $this->assertCommissionWithinCapLocked(
                    $property,
                    (float) ($data['commission_share'] ?? 0),
                    excludingCollaboratorId: $collaborator->id,
                );
            }

            $collaborator->fill($data)->save();

            return $collaborator;
        });

        return $this->json(['data' => $collaborator->refresh()->load('user')]);
    }

    public function destroy(Request $request, Property $property, PropertyCollaborator $collaborator): JsonResponse
    {
        $this->authorize('update', $property);
        abort_if($collaborator->property_id !== $property->id, 404);

        DB::transaction(fn () => $this->relireSousLeVerrouDuBien($property, $collaborator)->delete());

        return $this->json(null, 204);
    }

    /**
     * TCK-504 (ADR-0053 §3, vérification adverse m1) — changer le rôle d'une collaboration ou la
     * supprimer se sérialise avec la désignation sur le MÊME point : la ligne du bien, prise
     * avant la ligne de collaboration (ordre bien → ligne, celui de `PrimaryAgentDesignator`,
     * donc sans interblocage). La ligne est relue sous ce verrou : l'instance liée par la route
     * peut précéder une désignation validée entre-temps. À appeler dans une transaction.
     */
    private function relireSousLeVerrouDuBien(Property $property, PropertyCollaborator $collaborator): PropertyCollaborator
    {
        Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();

        $courante = $property->collaborators()->whereKey($collaborator->getKey())->first();
        abort_code_if($courante === null, 404, 'property.collaborator_not_found');

        return $courante;
    }

    /**
     * TCK-504 — les collaborateurs, et qui répond pour le bien : la ligne marquée
     * (`designated`), la ligne que l'ordre d'invitation désigne à défaut (`invitation_order`), ou
     * le propriétaire (`owner`). Une seule lecture, `PrimaryPropertyContact` : l'écran ne
     * recalcule rien.
     *
     * Une marque posée sur un agent devenu inéligible (compte bloqué, profil suspendu ou retiré)
     * reste en place et ne vaut rien (ADR-0053 §2) : `designated_unavailable` le dit, avec la
     * ligne marquée (`designated_collaborator_id`), pendant que `collaborator_id` nomme le repli
     * réellement servi — ou `null` si c'est le propriétaire (vérification adverse m3).
     *
     * `can_designate` dit si l'appelant peut désigner (vérification adverse m2) : la même règle que
     * l'endpoint, `update` du bien. Un agent qui lit la liste sans tenir `update` ne voit pas un
     * geste que le serveur lui refuserait.
     *
     * @return array{data: mixed, primary_contact: array{user_id: int|null, collaborator_id: int|null, designated_collaborator_id: int|null, source: string|null}, can_designate: bool}
     */
    private function collaboratorsPayload(Property $property, ?User $viewer): array
    {
        $property->load(PrimaryPropertyContact::eagerLoads());

        $principal = PrimaryPropertyContact::collaborateurPrincipal($property);
        $contact = PrimaryPropertyContact::for($property);
        $marque = $property->collaborators->first(fn (PropertyCollaborator $c) => $c->is_primary === true);

        return [
            // La forme d'avant (`with('user')`, sans les médias que le contact principal charge).
            'data' => $property->collaborators()->with('user')->orderBy('id')->get(),
            'primary_contact' => [
                'user_id' => $contact?->id,
                'collaborator_id' => $principal?->id,
                'designated_collaborator_id' => $marque?->id,
                'source' => match (true) {
                    $principal?->is_primary === true => 'designated',
                    $marque !== null => 'designated_unavailable',
                    $principal !== null => 'invitation_order',
                    $contact !== null => 'owner',
                    default => null,
                },
            ],
            'can_designate' => $viewer?->can('update', $property) === true,
        ];
    }

    /**
     * Sum existing collaborator shares with a row-level lock so concurrent
     * writers serialize on the same rows and the 100% cap is enforced
     * atomically. Must be called inside a DB::transaction.
     */
    protected function assertCommissionWithinCapLocked(
        Property $property,
        float $candidateShare,
        ?int $excludingCollaboratorId = null,
    ): void {
        // ⚠ Le verrou porte sur le BIEN, pas sur les lignes de collaborateurs — et ce
        // n'est pas une contrainte de syntaxe, c'est une correction de fond.
        //
        // La version précédente écrivait `->lockForUpdate()->sum('commission_share')`.
        // PostgreSQL le REFUSE (« FOR UPDATE is not allowed with aggregate functions »),
        // ce qui a rendu le défaut visible — mais le défaut ne venait pas de là.
        //
        // Verrouiller les lignes EXISTANTES ne ferme pas la course que ce code garde :
        // deux écrivains simultanés qui insèrent chacun 30 % sur un bien à 50 % lisent
        // tous deux 50, concluent tous deux que 80 ≤ 100, et le bien finit à 110. C'est
        // un INSERT concurrent, pas une modification de ligne existante — aucun verrou
        // de ligne ne le voit. MySQL en REPEATABLE READ le bloquait par un verrou
        // d'intervalle, mais c'était un effet de bord du moteur, jamais une intention
        // écrite ici ; PostgreSQL en READ COMMITTED n'en pose pas.
        //
        // Verrouiller la ligne du BIEN sérialise TOUS les écrivains de ce bien —
        // insertions comprises — sur les deux moteurs. C'est le point de sérialisation
        // portable, et il est plus fort que ce que la version précédente obtenait.
        //
        // ⚠⚠ Aucun test n'exerçait ce verrou. `test_store_commission_cap_runs_inside_transaction`
        // le dit dans son propre commentaire : « SQLite does not emit a literal FOR UPDATE
        // clause (the grammar strips it) », et il assertait donc le niveau de transaction,
        // pas le verrou. Le verrou était du code jamais exécuté par la suite.
        Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();

        $query = $property->collaborators();
        if ($excludingCollaboratorId !== null) {
            $query->where('id', '!=', $excludingCollaboratorId);
        }
        $currentTotal = (float) $query->sum('commission_share');

        if (round($currentTotal + $candidateShare, 2) > 100.0) {
            throw ValidationException::withMessages([
                'commission_share' => [__('validation.commission_share_exceeds_cap')],
            ]);
        }
    }
}
