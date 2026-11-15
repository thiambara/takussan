<?php

namespace App\Services\Documents;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\BailleurDuBien;

/**
 * TCK-2773 (ADR-0099, amendement du 2026-11-13) — LE juge du nom d'un auteur de document (téléverseur,
 * vérificateur, auteur d'une version, créateur d'un lien), selon le lecteur. Il sert :
 *
 * - `['name' => <nom>, 'role' => null]` à l'auteur lui-même, au super-admin, et au personnel ACTIF de
 *   l'agence du document — sauf s'il est le sujet de la fiche client qui porte le document : il lit
 *   alors comme le sujet (la règle de `DocumentPolicy::readsInternalOf`) ;
 * - `['name' => null, 'role' => 'platform']` pour un opérateur de la plateforme, à tout lecteur hors
 *   de la console (le personnel de l'agence compris) ;
 * - à tout autre lecteur, un rôle, jamais un nom : `landlord`, `tenant`, `customer`, `agency` ;
 * - `null` quand l'auteur est absent, ou que la règle ne le situe pas.
 *
 * Le nom est celui de `User::nameWithoutContact()` : jamais un numéro ni une adresse. Les libellés des
 * rôles appartiennent au front. Une instance sert UNE fiche (un document, un lecteur) : chaque auteur
 * n'y est jugé qu'une fois.
 */
final class AuteurDuDocument
{
    public const ROLE_PLATFORM = 'platform';

    public const ROLE_AGENCY = 'agency';

    public const ROLE_LANDLORD = 'landlord';

    public const ROLE_TENANT = 'tenant';

    public const ROLE_CUSTOMER = 'customer';

    /** @var array<int, array{name: string|null, role: string|null}|null> */
    private array $juges = [];

    private ?bool $lecteurLitLesNoms = null;

    private function __construct(
        private readonly Document $document,
        private readonly ?User $lecteur,
    ) {}

    public static function pour(Document $document, ?User $lecteur): self
    {
        return new self($document, $lecteur);
    }

    /**
     * @return array{name: string|null, role: string|null}|null
     */
    public function de(mixed $auteurId): ?array
    {
        if ($this->lecteur === null || $auteurId === null || ! is_numeric($auteurId)) {
            return null;
        }

        $id = (int) $auteurId;
        if (! array_key_exists($id, $this->juges)) {
            $this->juges[$id] = $this->juger($id);
        }

        return $this->juges[$id];
    }

    /** @return array{name: string|null, role: string|null}|null */
    private function juger(int $auteurId): ?array
    {
        $auteur = User::query()->find($auteurId, ['id', 'first_name', 'last_name', 'username']);
        if ($auteur === null) {
            return null;
        }

        $nom = $auteur->nameWithoutContact();
        $nomServi = $nom !== '—' ? ['name' => $nom, 'role' => null] : null;

        if ($auteurId === (int) $this->lecteur->id || $this->lecteur->isSuperAdmin()) {
            return $nomServi;
        }

        if ($this->estOperateur($auteurId)) {
            return ['name' => null, 'role' => self::ROLE_PLATFORM];
        }

        if ($this->lecteurLitLesNoms()) {
            return $nomServi ?? $this->role($auteur);
        }

        return $this->role($auteur);
    }

    /** Le personnel actif de l'agence du document, s'il n'est pas le sujet de sa fiche client. */
    private function lecteurLitLesNoms(): bool
    {
        if ($this->lecteurLitLesNoms !== null) {
            return $this->lecteurLitLesNoms;
        }

        $agencyId = self::agenceDu($this->document);
        $porteur = $this->document->documentable;
        $sujet = $porteur instanceof Customer && $porteur->user_id !== null
            && (int) $porteur->user_id === (int) $this->lecteur->id;

        return $this->lecteurLitLesNoms = $agencyId !== null && ! $sujet
            && $this->lecteur->staffAgencyId() === $agencyId;
    }

    /** @return array{name: null, role: string}|null */
    private function role(User $auteur): ?array
    {
        $porteur = $this->document->documentable;
        $agencyId = self::agenceDu($this->document);
        $role = null;

        $bien = match (true) {
            $porteur instanceof Property => $porteur,
            $porteur instanceof Booking, $porteur instanceof Inventory => $porteur->property,
            default => null,
        };
        $bailleurId = $porteur instanceof Lease ? $porteur->landlord_id : $bien?->user_id;

        if ($bailleurId !== null && BailleurDuBien::est($auteur, $bailleurId, $agencyId)) {
            $role = self::ROLE_LANDLORD;
        } elseif ($porteur instanceof Lease && $porteur->tenant?->user_id !== null && (int) $porteur->tenant->user_id === $auteur->id) {
            $role = self::ROLE_TENANT;
        } elseif ($porteur instanceof Customer && $porteur->user_id !== null && (int) $porteur->user_id === $auteur->id) {
            $role = self::ROLE_CUSTOMER;
        } elseif ($porteur instanceof Booking && $porteur->customer?->user_id !== null && (int) $porteur->customer->user_id === $auteur->id) {
            $role = self::ROLE_CUSTOMER;
        } elseif ($agencyId !== null && $this->estOuFutDuPersonnel($auteur->id, $agencyId)) {
            $role = self::ROLE_AGENCY;
        }

        return $role === null ? null : ['name' => null, 'role' => $role];
    }

    /** Un profil de plateforme, de tout statut, supprimé compris. */
    private function estOperateur(int $auteurId): bool
    {
        return PlatformProfile::withTrashed()->where('user_id', $auteurId)->exists();
    }

    /** Un profil d'agent ou d'administrateur dans l'agence, de tout statut, supprimé compris. */
    private function estOuFutDuPersonnel(int $auteurId, int $agencyId): bool
    {
        return AgentProfile::withTrashed()->where('user_id', $auteurId)->where('agency_id', $agencyId)->exists()
            || AgencyAdminProfile::withTrashed()->where('user_id', $auteurId)->where('agency_id', $agencyId)->exists();
    }

    /** L'agence du document : celle du porteur, celle de son bien pour un état des lieux, l'agence elle-même. */
    private static function agenceDu(Document $document): ?int
    {
        $porteur = $document->documentable;

        $agencyId = match (true) {
            $porteur instanceof Agency => $porteur->id,
            $porteur instanceof Inventory => $porteur->property?->agency_id,
            default => $porteur?->agency_id ?? null,
        };

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
