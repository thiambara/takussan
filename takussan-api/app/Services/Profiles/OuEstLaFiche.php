<?php

namespace App\Services\Profiles;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-2847 (ADR-0116) — sous lequel de ses profils actifs l'appelant lit-il cette fiche ?
 *
 * La policy `view` de la fiche est appelée sous chaque profil actif ({@see SousLeProfil}) ; le premier
 * qui la lit est rendu. Les profils de l'agence de la fiche sont essayés d'abord : ce n'est qu'un
 * ORDRE, jamais un filtre — la garde est la policy (AC4). `null` dans tous les autres cas, sans
 * distinguer une fiche absente d'une fiche illisible.
 */
final class OuEstLaFiche
{
    /** Le mot de l'URL → le modèle. Liste fermée : rien d'autre n'est jamais résolu. */
    public const TYPES = [
        'bien' => Property::class,
        'demande' => PropertyContactLead::class,
        'client' => Customer::class,
        'bail' => Lease::class,
        'intervention' => MaintenanceRequest::class,
        'visite' => PropertyVisit::class,
        'reservation' => Booking::class,
        'bailleur' => OwnerProfile::class,
    ];

    public function __construct(private readonly ActiveProfileResolver $resolver) {}

    public function localiser(User $user, string $type, int $id): ?Model
    {
        // ADR-0116 § 4 — `Gate::before` accorde tout au super-admin : sous n'importe quel profil, la
        // réponse nommerait un espace au hasard.
        if ($user->isSuperAdmin()) {
            return null;
        }

        $classe = self::TYPES[$type] ?? null;
        $fiche = $classe !== null ? $classe::query()->find($id) : null;
        if ($fiche === null) {
            return null;
        }

        $agence = $this->agenceDe($fiche);
        $profils = $user->profiles()
            ->filter(fn (Model $p): bool => ActiveProfileResolver::isActiveProfile($p))
            ->sortBy(fn (Model $p): int => $agence !== null && (int) ($p->getAttribute('agency_id') ?? 0) === $agence ? 0 : 1)
            ->values();

        $gate = Gate::forUser($user);
        foreach ($profils as $profil) {
            if (SousLeProfil::juger($profil, fn (): bool => $gate->allows('view', $fiche))) {
                return $profil;
            }
        }

        return null;
    }

    /** Seulement pour l'ordre des essais : l'agence de la fiche, ou celle de son bien. */
    private function agenceDe(Model $fiche): ?int
    {
        $agence = $fiche->getAttribute('agency_id');
        if ($agence === null && method_exists($fiche, 'property')) {
            $agence = $fiche->property?->agency_id;
        }

        return is_numeric($agence) ? (int) $agence : null;
    }

    /**
     * La réponse : le profil, son agence, son type. Rien de la fiche.
     *
     * @return array{profile_id: string, agency: array{id: int, name: string}|null, role: string}
     */
    public function enReponse(Model $profil): array
    {
        $agence = $profil->getAttribute('agency_id') !== null ? $profil->agency : null;

        return [
            'profile_id' => $this->resolver->compositeId($profil),
            'agency' => $agence !== null ? ['id' => (int) $agence->id, 'name' => (string) $agence->name] : null,
            'role' => $this->resolver->aliasFor($profil),
        ];
    }
}
