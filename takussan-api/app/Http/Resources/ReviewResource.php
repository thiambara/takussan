<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Property\PrimaryPropertyContact;
use App\Services\Review\ReviewEligibility;
use App\Services\Review\ReviewRiskClassifier;
use Illuminate\Http\Request;

class ReviewResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $author = $this->resource->author;
        $viewer = $request->user();
        // TCK-2672, TCK-2722 — qui modère dans le périmètre de l'avis (la règle de `GET …/reports`)
        // lit son risque et son nombre de signalements ; l'auteur et le public, ni l'un ni l'autre.
        $readsReports = $viewer !== null && $viewer->can('viewReports', $this->resource);
        // TCK-1781 (P175.05) — un auteur effacé ou sans nom rend `name` nul : le front écrit
        // « Anonyme » dans la langue du lecteur (principe 5), l'API n'émet pas de libellé.
        $authorName = $author
            ? (trim(($author->first_name ?? '').' '.($author->last_name ?? '')) ?: ($author->username ?: null))
            : null;

        return [
            'id' => $this->id,
            'reviewable_type' => $this->reviewable_type,
            'reviewable_id' => $this->reviewable_id,
            'target' => $this->when(
                $this->resource->relationLoaded('reviewable'),
                fn () => $this->buildTarget()
            ),
            'author_id' => $this->author_id,
            'author' => [
                'id' => $author?->id,
                'name' => $authorName,
                'avatar_url' => $author?->avatarUrl(),
            ],
            'rating' => $this->rating,
            'title' => $this->title,
            'content' => $this->content,
            'is_approved' => (bool) $this->is_approved,
            'status' => $this->status?->value,
            // TCK-2722 (décision du porteur du 2026-11-11) — clé absente pour l'auteur et le public :
            // le compte, et sa trace après ré-approbation, ne se lisent que par qui modère.
            'reported_count' => $this->when($readsReports, fn (): int => (int) ($this->reported_count ?? 0)),
            'reply_content' => $this->reply_content,
            'replied_at' => $this->iso($this->replied_at),
            'created_at' => $this->iso($this->created_at),
            // TCK-2522 (contre-vérification du 2026-11-09) — le TYPE de la preuve d'éligibilité
            // (`lease`, `booking`, `visit`, `maintenance_request`) et lui seul : jamais
            // `context_id` ni `context_type`, qui désigneraient le contrat de l'auteur.
            'context_kind' => ReviewEligibility::contextKindOf($this->resource->context_type),
            // verif-597 m1 — les gestes que l'API ACCEPTERA, jugés par la policy : le front ne les
            // devine plus (il offrait « Répondre » ou « Approuver » que l'API refusait en 403).
            'can_reply' => $viewer !== null && $viewer->can('reply', $this->resource),
            'can_moderate' => $viewer !== null && $viewer->can('moderate', $this->resource),
            // TCK-2672 — le risque ({@see ReviewRiskClassifier}), pour qui modère dans le périmètre
            // de l'avis (la règle de `GET …/reports`) : absent pour l'auteur et le public.
            'risk' => $this->when(
                $readsReports,
                fn () => app(ReviewRiskClassifier::class)->classify($this->resource),
            ),
        ];
    }

    /**
     * @return array<string,mixed>|null
     */
    private function buildTarget(): ?array
    {
        $target = $this->resource->reviewable;

        if ($target instanceof Property) {
            // TCK-2672 — le sujet se reconnaît : sa photo principale et son agent principal (le
            // collaborateur qui répond pour le bien, {@see PrimaryPropertyContact}), `null` sans.
            $photo = $target->getFirstMedia('photos');
            $agent = PrimaryPropertyContact::collaborateurPrincipal($target)?->user;

            return [
                'type' => 'property',
                'id' => $target->id,
                'title' => $target->title,
                'slug' => $target->slug,
                'subtitle' => $target->reference_number,
                'photo_url' => $photo === null ? null : PublicPhotoUrl::upTo($photo, 'preview', fn () => $target->requiresWatermark()),
                'agent' => $agent === null ? null : [
                    'id' => $agent->id,
                    'name' => trim(($agent->first_name ?? '').' '.($agent->last_name ?? '')) ?: ($agent->username ?: null),
                ],
            ];
        }

        if ($target instanceof Agency) {
            return [
                'type' => 'agency',
                'id' => $target->id,
                'title' => $target->name,
                'slug' => $target->slug,
                'subtitle' => null,
            ];
        }

        // TCK-597 — le prestataire est noté sur son profil (ADR-0043 §2).
        if ($target instanceof ServiceProviderProfile) {
            return [
                'type' => 'service_provider',
                'id' => $target->id,
                'title' => $target->user?->full_name,
                'slug' => null,
                'subtitle' => null,
            ];
        }

        if ($target instanceof User) {
            $name = trim(($target->first_name ?? '').' '.($target->last_name ?? ''))
                ?: ($target->username ?? 'Utilisateur');

            return [
                'type' => 'user',
                'id' => $target->id,
                'title' => $name,
                // TCK-2519 — le segment de `/agents/{slug}`, au nom quand il est posé.
                'slug' => $target->slugDeFiche(),
                'subtitle' => null,
            ];
        }

        return null;
    }
}
