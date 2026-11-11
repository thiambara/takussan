<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Invitation;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Services\Invitation\InvitationService;
use App\Support\Masking;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use stdClass;

/**
 * TCK-2609 (ADR-0094 §1-3) — ce que l'invité voit de son invitation AVANT de rien donner : l'agence,
 * le prénom de qui l'invite, le rôle, ce qui l'attend.
 *
 * Le jeton est un secret PORTEUR : quiconque le tient lit cette réponse. Elle n'en dit donc pas plus
 * que le message reçu — le destinataire masqué ({@see Masking}), l'invitant par son seul prénom,
 * aucun identifiant interne, l'agence par sa ville seule (jamais sa rue ni son quartier).
 *
 * L'agence suit les règles de sa fiche publique (`PublicAgencyController::show`), sans seconde
 * définition : le téléphone n'est public que pour une agence `active` et `standard`, le compte des
 * biens est le portefeuille public (`Property::publicPortfolio()`), `verified` est `is_verified`.
 *
 * @mixin Invitation
 */
class PublicInvitationPreviewResource extends BaseResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        /** @var Invitation $invitation */
        $invitation = $this->resource;
        $agency = $invitation->agency;
        $inviter = $invitation->inviter;

        return [
            'role' => $invitation->role,
            'agency' => $agency === null ? null : [
                'name' => $agency->name,
                'logo_url' => self::logoUrl($agency),
                'city' => $agency->addresses->first()?->city,
                'public_properties_count' => Property::query()->where('agency_id', $agency->id)->publicPortfolio()->count(),
                'verified' => (bool) $agency->is_verified,
                'public_phone' => self::publicPhone($agency),
            ],
            'inviter' => $inviter === null ? null : ['first_name' => trim((string) $inviter->first_name) ?: null],
            'recipient' => $this->recipient($invitation),
            'recipient_has_account' => $this->recipientHasAccount($invitation),
            'expires_at' => $this->iso($invitation->expires_at),
            'invited_at' => $this->iso($invitation->created_at),
            // Le nom que l'agence a saisi, pour préremplir le formulaire de l'invité (TCK-2281).
            'prefill' => [
                'first_name' => trim((string) data_get($invitation->metadata, 'first_name', '')),
                'last_name' => trim((string) data_get($invitation->metadata, 'last_name', '')),
            ],
            'awaiting' => $this->awaiting($invitation),
        ];
    }

    /**
     * Le complément d'un 410 (expirée, révoquée, acceptée) : de quoi dire « Dakar Immo vous avait
     * invité le 3 nov. » et donner l'issue — l'agence (nom, logo, téléphone public) et la date. Une
     * agence supprimée n'est plus nommée.
     *
     * @return array{agency: array{name: string, logo_url: ?string, public_phone: ?string}|null, invited_at: ?string}
     */
    public function closed(): array
    {
        /** @var Invitation $invitation */
        $invitation = $this->resource;
        $agency = $invitation->agency;

        return [
            'agency' => $agency === null ? null : [
                'name' => $agency->name,
                'logo_url' => self::logoUrl($agency),
                'public_phone' => self::publicPhone($agency),
            ],
            'invited_at' => $this->iso($invitation->created_at),
        ];
    }

    /** TCK-1076 — la collection `logo`, comme la fiche publique : `$agency->logo_url` n'existe pas. */
    private static function logoUrl(Agency $agency): ?string
    {
        return $agency->getFirstMediaUrl('logo') ?: null;
    }

    /** Le téléphone de l'agence, s'il est public : l'agence a une fiche publique (TCK-600, ADR-0048). */
    private static function publicPhone(Agency $agency): ?string
    {
        $public = $agency->status === AgencyStatus::Active && $agency->kind === AgencyKind::Standard;

        return $public ? $agency->phone : null;
    }

    /** @return array{channel: 'email'|'phone', masked: string}|null */
    private function recipient(Invitation $invitation): ?array
    {
        if ($invitation->email !== null) {
            return ['channel' => 'email', 'masked' => Masking::email($invitation->email)];
        }

        return $invitation->phone !== null
            ? ['channel' => 'phone', 'masked' => Masking::phone($invitation->phone)]
            : null;
    }

    /**
     * Le compte que l'acceptation lierait existe-t-il ? Même résolution que l'acceptation
     * (`InvitationService::recipientAccount`) : par l'e-mail, sinon par le numéro VÉRIFIÉ.
     */
    private function recipientHasAccount(Invitation $invitation): bool
    {
        if ($invitation->email === null && $invitation->phone === null) {
            return false;
        }

        $sms = $invitation->email === null ? $invitation->phone : null;

        return app(InvitationService::class)->recipientAccount($invitation->email, $sms) !== null;
    }

    /**
     * Ce qui attend l'invité : au bailleur, les biens déjà liés à sa fiche (`pending_owner_profile_id`,
     * TCK-1000) ; au prestataire, l'intervention dont l'invitation est partie
     * (`metadata.from_maintenance_request_id`), si elle est bien de l'agence qui invite. Sinon, rien.
     *
     * @return array<string, mixed>|stdClass
     */
    private function awaiting(Invitation $invitation): array|stdClass
    {
        if ($invitation->role === 'owner') {
            $profile = $invitation->invitable_type === OwnerProfile::class ? $invitation->invitable_id : null;

            return [
                'properties_count' => $profile === null ? 0 : Property::query()->where('pending_owner_profile_id', $profile)->count(),
            ];
        }

        $requestId = data_get($invitation->metadata, 'from_maintenance_request_id');
        if ($invitation->role === 'service_provider' && is_numeric($requestId) && $invitation->agency_id !== null) {
            $maintenance = MaintenanceRequest::query()
                ->whereKey((int) $requestId)
                ->whereHas('property', fn (Builder $property) => $property->where('agency_id', $invitation->agency_id))
                ->with('property')
                ->first();

            if ($maintenance !== null) {
                return ['maintenance_request' => [
                    'title' => $maintenance->title,
                    'property_label' => $maintenance->property?->title,
                    'reported_at' => $this->iso($maintenance->created_at),
                ]];
            }
        }

        return new stdClass;
    }
}
