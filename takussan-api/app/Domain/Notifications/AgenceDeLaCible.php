<?php

namespace App\Domain\Notifications;

use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2751 — l'agence de l'OBJET qu'ouvre une notification, rendue au lecteur dans
 * `target.agency_id`, pour que la cloche bascule sur son profil de cette agence avant d'ouvrir
 * l'objet (`LienDansLAgence`, TCK-1761). Sans elle, un agent de l'agence 1 qui lit dans son espace
 * de propriétaire de l'agence 2 ouvrait « Intervention clôturée » sur un 403.
 *
 * **Résolue à la LECTURE, pour le lecteur, jamais stockée.** La clé n'est rendue que si le lecteur
 * tient un profil ACTIF dans l'agence de l'objet ({@see User::activeAgencyIds()}) :
 *   · un locataire, un client, un prestataire (profil sans agence) n'apprennent jamais l'identifiant
 *     d'une agence dont ils ne sont pas membres, et leur ligne reste un lien simple — le front rend
 *     une ligne inerte quand `agency_id` désigne une agence où il n'a pas de profil ;
 *   · l'appartenance se juge au moment où l'on lit : un membre parti ne la reçoit plus, un profil
 *     suspendu non plus (la bascule lui serait refusée, `profile.not_accessible`).
 * Les ~3 500 lignes déjà émises et les cibles déduites de `data` ({@see NotificationTarget::derive()})
 * en profitent donc sans reprise de données.
 *
 * **Une seule porte pour les deux sources** (décision de la session du 2026-11-14) : une cible qui
 * porte DÉJÀ son agence ({@see NotificationTarget::forAgency()}, avis de la section d'agence,
 * TCK-1761) passe par la même règle. Un membre parti ou suspendu qui relit ses anciennes
 * notifications n'y lit plus l'identifiant de l'agence — et, pour une page de SECTION, n'a plus de
 * lien du tout : la cible est rendue `null`, la ligne inerte qu'il voyait avant (TCK-1761). Un lien
 * simple vers `/app/agency/finances` ouvrirait les données de l'agence de son profil actif, sans le
 * dire. Une cible d'OBJET garde son lien simple : la fiche refuse elle-même (403).
 *
 * Un objet supprimé (y compris en corbeille) ou introuvable ne rend pas de clé.
 *
 * Le genre de chaque cible est classé dans UNE des trois listes ci-dessous ;
 * `AgenceDeLaCibleTest` rougit sur un genre de `NotificationTarget::PATHS` qui n'y est pas.
 */
final class AgenceDeLaCible
{
    /**
     * Les objets d'agence : genre → [table, colonne d'agence, corbeille]. Une colonne `null` lit
     * l'agence du bien (`property_id` → `properties.agency_id`, bien en corbeille exclu), comme les
     * policies de ces objets. `corbeille` : la table a `deleted_at` (gardé par `AgenceDeLaCibleTest`).
     *
     * @var array<string, array{0: string, 1: ?string, 2: bool}>
     */
    public const OBJETS = [
        'lease' => ['leases', 'agency_id', true],
        'booking' => ['bookings', 'agency_id', true],
        'property' => ['properties', 'agency_id', true],
        'lead' => ['property_contact_leads', 'agency_id', false],
        'visit' => ['property_visits', null, false],
        'maintenance' => ['maintenance_requests', null, true],
    ];

    /**
     * Les pages d'une section d'agence, sans objet à relire : elles lisent l'agence du profil actif,
     * et c'est leur émetteur qui pose l'agence ({@see NotificationTarget::forAgency()}).
     *
     * @var list<string>
     */
    public const SECTIONS = [
        'payments', 'payouts', 'payout_approvals', 'service_provider_bills', 'commissions',
        'agency_kyc', 'finances', 'agency_billing', 'team', 'owners', 'service_providers',
        'role_delegations', 'agency_settings', 'audit', 'review_moderation', 'property_moderation',
        'credits',
    ];

    /**
     * Hors de toute agence : la page ne dépend pas de l'espace actif (participant d'une
     * conversation, avis reçus, recherches et favoris du compte, revues de la plateforme).
     *
     * @var list<string>
     */
    public const HORS_AGENCE = [
        'conversation', 'reviews', 'saved_searches', 'favorites', 'kyc_review', 'agency_upgrade_request',
        // TCK-2783 — une pièce du coffre : `documents` n'a pas de colonne d'agence (son porteur la
        // porte, quand il en a une), et la fiche juge elle-même son lecteur (`DocumentPolicy::view`).
        'document',
        // TCK-2812 — le coffre de l'appelant (`/app/documents`), où l'archive préparée se télécharge : il
        // n'est d'aucune agence, et l'archive n'appartient qu'à son demandeur.
        'document_archive',
    ];

    /** @var array<string, array<int, ?int>> genre → id → agence (null : objet sans agence ou absent) */
    private array $agences = [];

    /** @var list<int>|null */
    private ?array $agencesDuLecteur = null;

    private function __construct(private readonly ?User $lecteur) {}

    /** L'instance de la requête : une par lecteur, partagée par toutes les lignes d'une page. */
    public static function pour(Request $request): self
    {
        $instance = $request->attributes->get(self::class);
        if (! $instance instanceof self) {
            $user = $request->user();
            $instance = new self($user instanceof User ? $user : null);
            $request->attributes->set(self::class, $instance);
        }

        return $instance;
    }

    /**
     * Charge en une requête par genre les agences des objets d'une page, au lieu d'une par ligne.
     *
     * @param  iterable<AppNotification>  $lignes
     */
    public function precharger(iterable $lignes): self
    {
        $ids = [];
        foreach ($lignes as $ligne) {
            $cible = NotificationTarget::forRow($ligne);
            if ($cible !== null && $this->aResoudre($cible)) {
                $ids[$cible->kind][] = (int) $cible->id;
            }
        }
        foreach ($ids as $genre => $liste) {
            $this->charger($genre, $liste);
        }

        return $this;
    }

    /**
     * La cible telle que le lecteur peut la lire : avec l'agence (stockée, ou celle de son objet) s'il
     * y tient un profil actif ; sinon sans elle, ou `null` (ligne inerte) pour une section d'agence.
     */
    public function completer(?NotificationTarget $cible): ?NotificationTarget
    {
        if ($cible === null) {
            return null;
        }
        $agence = $cible->agencyId;
        if ($agence === null && $this->aResoudre($cible)) {
            $id = (int) $cible->id;
            if (! array_key_exists($id, $this->agences[$cible->kind] ?? [])) {
                $this->charger($cible->kind, [$id]);
            }
            $agence = $this->agences[$cible->kind][$id] ?? null;
        }

        return $this->porte($cible, $agence);
    }

    /**
     * LA porte, unique pour les deux sources de l'agence : la clé ne sort que vers un lecteur qui
     * tient un profil actif dans cette agence.
     */
    private function porte(NotificationTarget $cible, ?int $agence): ?NotificationTarget
    {
        if ($agence !== null && in_array($agence, $this->agencesDuLecteur(), true)) {
            return $cible->agencyId === $agence ? $cible : $cible->forAgency($agence);
        }
        if ($cible->agencyId === null) {
            return $cible;
        }
        if (in_array($cible->kind, self::SECTIONS, true)) {
            return null;
        }
        $sansAgence = $cible->toArray();
        unset($sansAgence['agency_id']);

        return NotificationTarget::fromArray($sansAgence) ?? $cible;
    }

    private function aResoudre(NotificationTarget $cible): bool
    {
        return $cible->agencyId === null && $cible->id !== null && array_key_exists($cible->kind, self::OBJETS);
    }

    /** @return list<int> */
    private function agencesDuLecteur(): array
    {
        return $this->agencesDuLecteur ??= $this->lecteur?->activeAgencyIds() ?? [];
    }

    /**
     * Lu par le constructeur de requêtes, hors des portées d'Eloquent : la visibilité d'un objet
     * dépend du profil ACTIF, celui-là même qui n'est pas le bon — c'est le défaut corrigé ici.
     * La seule garde est l'appartenance du lecteur, jugée par {@see completer()}.
     *
     * @param  list<int>  $ids
     */
    private function charger(string $genre, array $ids): void
    {
        [$table, $colonne, $corbeille] = self::OBJETS[$genre];
        $ids = array_values(array_unique($ids));
        $requete = DB::table($table)
            ->whereIn($table.'.id', $ids)
            ->when($corbeille, fn ($q) => $q->whereNull($table.'.deleted_at'));
        $lignes = $colonne !== null
            ? $requete->pluck($table.'.'.$colonne, $table.'.id')
            : $requete
                ->join('properties', 'properties.id', '=', $table.'.property_id')
                ->whereNull('properties.deleted_at')
                ->pluck('properties.agency_id', $table.'.id');

        foreach ($ids as $id) {
            $agence = $lignes[$id] ?? null;
            $this->agences[$genre][$id] = is_numeric($agence) ? (int) $agence : null;
        }
    }
}
