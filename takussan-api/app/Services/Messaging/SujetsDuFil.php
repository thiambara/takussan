<?php

namespace App\Services\Messaging;

use App\Models\Booking;
use App\Models\Commitment;
use App\Models\Enums\PropertyStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use LogicException;

/**
 * TCK-2957 (ADR-0128 § 1) — le registre FERMÉ des objets qu'un fil connaît : type → modèle → droit
 * de lecture → peut-il être le sujet d'un fil.
 *
 * C'est le SEUL endroit où une clé de type (`conversations.subject_type`, plus tard l'objet d'une
 * carte) devient une classe. Aucune chaîne venue d'une requête n'est résolue hors d'ici : ni
 * `new $type`, ni `$modele->{$nom}()`, ni `Relation::getMorphedModel()`, ni morph map globale (qui
 * toucherait les autres relations polymorphes du dépôt). Un type inconnu LÈVE une exception de
 * logique : un `null` muet serait pris pour « objet supprimé ».
 *
 * La table est une constante, lue sans conteneur : les jeux de données de PHPUnit, qui tournent
 * avant le démarrage de l'application, en tirent une ligne par type (`FilFermeALaSuppressionTest`).
 *
 * Ajouter un type : une ligne ici, avec sa projection, et sa résolution dans {@see ObjetsDesMessages}
 * (un `match` sans défaut : un type oublié lève). S'il est sujet, l'observateur `FermeLeFilDeSonObjet`
 * le couvre sans autre code (branché par une boucle dans `AppServiceProvider::bootObservers()`).
 * TCK-2958 y a ajouté trois types qui ne sont pas des sujets (`lease_payment`, `inventory`,
 * `property_visit`).
 *
 * TCK-2964 (ADR-0128 § 4) — `posable` : le type peut être POSÉ dans un fil par un participant
 * (`POST /api/conversations/{c}/cards`), avec la seule carte de son type au catalogue
 * ({@see CodesDuFil::carteDePose()}). `publique` : le type se lit AUSSI de tout lecteur quand l'objet
 * est publié (le bien : la règle même de sa fiche publique, {@see self::publicsParmi()}).
 */
final class SujetsDuFil
{
    /**
     * TCK-2958 (ADR-0128 § 3) — chaque type déclare aussi sa PROJECTION : les clés retenues de la
     * ressource de l'objet résolue pour le lecteur ({@see ObjetsDesMessages}), en chemins `cle` ou
     * `bloc.cle` (deux niveaux, jamais un bloc imbriqué rendu entier), et les relations à charger
     * EN LOT avec l'objet. `via` : la relation dont la politique juge la lecture, pour un objet qui
     * n'a pas de `view` à lui (une échéance se lit comme son bail).
     *
     * ⚠ AUCUNE projection ne porte de téléphone ni d'e-mail, d'aucune partie : la carte n'en a pas
     * besoin, et le fil est le moyen de joindre. D'où des blocs de parties réduits à `id` et nom
     * (`LeaseResource` rend le téléphone du bailleur au personnel de l'agence ; la carte, non).
     * `RelectureDesObjetsTest` le vérifie pour chaque type et chaque lecteur, à toute profondeur.
     *
     * @var array<string, array{modele: class-string<Model>, lecture: string, via?: string, publique?: bool, sujet: bool, posable?: bool, projection: list<string>, charger: list<string>}>
     */
    private const TABLE = [
        'maintenance_request' => [
            'modele' => MaintenanceRequest::class, 'lecture' => 'view', 'sujet' => true,
            // `quote_*`, `estimated_cost`, `actual_cost` : retenus, mais la ressource les ôte pour le
            // demandeur — la projection n'ajoute rien à ce que le lecteur lit déjà.
            'projection' => [
                'id', 'title', 'status', 'category', 'priority', 'scheduled_at', 'completed_at',
                'property_id', 'lease_id', 'requester_id', 'assigned_to', 'file', 'waiting_on',
                'quote_amount', 'quote_currency', 'estimated_cost', 'actual_cost',
                'property.id', 'property.title', 'assignee.id', 'assignee.name', 'requester.id', 'requester.name',
                'abilities',
            ],
            // `media` : `has_voice_note` le lit (sans lui, une requête de médias par demande).
            'charger' => ['property', 'assignee', 'requester', 'media'],
        ],
        'lease' => [
            'modele' => Lease::class, 'lecture' => 'view', 'sujet' => true,
            'projection' => [
                'id', 'reference_number', 'type', 'status', 'start_date', 'end_date', 'monthly_rent',
                'monthly_charges', 'currency', 'payment_frequency', 'property_id', 'landlord_id', 'agent_id',
                'property.id', 'property.title', 'landlord.id', 'landlord.full_name', 'agent.id', 'agent.full_name',
                'abilities',
            ],
            'charger' => ['property', 'landlord', 'agent', 'tenant'],
        ],
        'booking' => [
            'modele' => Booking::class, 'lecture' => 'view', 'sujet' => true,
            'projection' => [
                'id', 'reference_number', 'kind', 'status', 'start_date', 'end_date', 'property_id',
                'response_deadline', 'awaiting', 'property.id', 'property.title',
                'customer.id', 'customer.first_name', 'customer.last_name', 'abilities',
            ],
            'charger' => ['property', 'customer', 'latestCounterOffer'],
        ],
        // TCK-2958 — trois types d'objets de CARTE, qui ne sont pas sujets d'un fil.
        'lease_payment' => [
            'modele' => LeasePayment::class, 'lecture' => 'view', 'via' => 'lease', 'sujet' => false,
            'projection' => [
                'id', 'reference_number', 'lease_id', 'payment_type', 'status', 'period_start', 'period_end',
                'due_date', 'paid_at', 'amount', 'amount_due', 'currency', 'is_overdue', 'abilities',
            ],
            'charger' => ['lease.agency', 'lease.tenant', 'lease.property'],
        ],
        'inventory' => [
            'modele' => Inventory::class, 'lecture' => 'view', 'sujet' => false,
            'projection' => [
                'id', 'type', 'status', 'lease_id', 'property_id', 'conducted_at', 'tenant_signed', 'owner_signed',
                'signed_at', 'abilities', 'can_sign_as',
            ],
            'charger' => ['lease.tenant', 'lease.landlord', 'tenant', 'property'],
        ],
        // TCK-2964 — posable : « Proposer un créneau » pose la visite créée par sa route.
        'property_visit' => [
            'modele' => PropertyVisit::class, 'lecture' => 'view', 'sujet' => false, 'posable' => true,
            'projection' => [
                'id', 'type', 'status', 'scheduled_at', 'preferred_window', 'property_id',
                'property.id', 'property.title', 'abilities', 'can_confirm',
            ],
            'charger' => ['property.address', 'property.media'],
        ],
        // TCK-2964 (ADR-0128 § 4) — le bien partagé. Publié, il se lit de TOUT lecteur, et la projection
        // ne retient que des clés de sa fiche publique (`GET /api/public/properties/{slug}`), plus les
        // gestes du lecteur (`abilities`) ; sinon `PropertyPolicy::view`. Ni adresse précise, ni
        // coordonnées, ni contact : le quartier et la ville seulement.
        'property' => [
            'modele' => Property::class, 'lecture' => 'view', 'publique' => true, 'sujet' => false, 'posable' => true,
            'projection' => [
                'id', 'slug', 'title', 'price', 'currency', 'type', 'contract_type', 'rent_period', 'status',
                'bedrooms', 'area', 'available_from', 'main_photo_url', 'location.quarter', 'location.city',
                'abilities',
            ],
            'charger' => ['address', 'media'],
        ],
        // TCK-2969 (ADR-0130 § 2) — l'engagement : il se lit comme son fil (`CommitmentPolicy::view`), n'est
        // ni sujet ni posable (il naît par sa route). Porteur et bénéficiaire : `id` et nom, sans contact.
        'commitment' => [
            'modele' => Commitment::class, 'lecture' => 'view', 'sujet' => false,
            'projection' => [
                'id', 'title', 'status', 'etat', 'due_at', 'confirmed_at', 'kept_at', 'reopened_at', 'reopen_reason',
                'holder.id', 'holder.name', 'beneficiary.id', 'beneficiary.name', 'object.type', 'object.id',
                'abilities',
            ],
            'charger' => ['conversation', 'holder', 'beneficiary'],
        ],
    ];

    /** @return list<string> tous les types du registre */
    public static function types(): array
    {
        return array_keys(self::TABLE);
    }

    /** @return list<string> les types qui peuvent être le sujet d'un fil */
    public static function typesSujets(): array
    {
        return array_keys(array_filter(self::TABLE, fn (array $entree) => $entree['sujet']));
    }

    /**
     * TCK-2964 — les types qu'un participant peut POSER dans un fil.
     *
     * @return list<string>
     */
    public static function typesPosables(): array
    {
        return array_keys(array_filter(self::TABLE, fn (array $entree) => $entree['posable'] ?? false));
    }

    /**
     * TCK-2964 — parmi `$ids`, ceux qui se lisent EN PUBLIC (type `publique`), en une requête : la
     * règle de la fiche publique, `Property::public()` hors brouillon (`PublicPropertyController::show`).
     * `[]` pour un type qui ne se lit jamais en public.
     *
     * @param  list<int>  $ids
     * @return list<int>
     */
    public static function publicsParmi(string $type, array $ids): array
    {
        if (! (self::entree($type)['publique'] ?? false) || $ids === []) {
            return [];
        }

        return match ($type) {
            'property' => Property::query()->public()->whereNot('status', PropertyStatus::Draft)->whereKey($ids)
                ->pluck('id')->map(fn ($id) => (int) $id)->all(),
            default => throw new LogicException("Type public sans règle de publication : « {$type} »."),
        };
    }

    /** @return class-string<Model> */
    public static function modele(string $type): string
    {
        return self::entree($type)['modele'];
    }

    /** La clé de registre d'un objet ; sa classe exacte doit y figurer (une sous-classe n'y est pas). */
    public static function typeDe(Model $objet): string
    {
        foreach (self::TABLE as $type => $entree) {
            if ($objet::class === $entree['modele']) {
                return $type;
            }
        }

        throw new LogicException('Objet hors du registre des sujets du fil : '.$objet::class.'.');
    }

    /** La clé d'un objet qui peut être SUJET d'un fil : ce qu'on écrit dans `subject_type`. */
    public static function typeDuSujet(Model $objet): string
    {
        $type = self::typeDe($objet);
        if (! self::TABLE[$type]['sujet']) {
            throw new LogicException("Le type « {$type} » ne peut pas être le sujet d'un fil.");
        }

        return $type;
    }

    /**
     * L'objet d'un type du registre, supprimé en douceur compris (l'appelant juge de `trashed()`).
     * `null` seulement si aucune ligne ne porte cet identifiant ; un type inconnu lève.
     */
    public static function resoudre(string $type, int $id): ?Model
    {
        $modele = self::modele($type);
        $requete = in_array(SoftDeletes::class, class_uses_recursive($modele), true)
            ? $modele::withTrashed()
            : $modele::query();

        return $requete->whereKey($id)->first();
    }

    /**
     * Le lecteur lit-il cet objet ? La politique de l'objet en décide (`view`) — ou celle de l'objet
     * qui le porte (`via`, TCK-2958 : une échéance se lit comme son bail ; sans lui, refus).
     *
     * TCK-2964 — un type `publique` se lit aussi de tout lecteur quand l'objet est publié.
     * `$publics` : les identifiants publiés de la page, calculés une fois ({@see self::publicsParmi()}) ;
     * sans eux, la règle est jugée pour ce seul objet.
     *
     * @param  list<int>|null  $publics
     */
    public static function peutLire(User $lecteur, Model $objet, ?array $publics = null): bool
    {
        $type = self::typeDe($objet);
        $entree = self::TABLE[$type];
        if ($entree['publique'] ?? false) {
            $publics ??= self::publicsParmi($type, [(int) $objet->getKey()]);
            if (in_array((int) $objet->getKey(), $publics, true)) {
                return true;
            }
        }
        if (isset($entree['via'])) {
            $porteur = $objet->{$entree['via']};

            return $porteur instanceof Model && $lecteur->can($entree['lecture'], $porteur);
        }

        return $lecteur->can($entree['lecture'], $objet);
    }

    /**
     * TCK-2958 — les clés de la projection du type, en chemins `cle` ou `bloc.cle`.
     *
     * @return list<string>
     */
    public static function projection(string $type): array
    {
        return self::entree($type)['projection'];
    }

    /**
     * TCK-2958 — les objets d'un type, chargés EN UNE REQUÊTE avec les relations de leur projection.
     * Un objet supprimé en douceur n'est pas rendu (sa carte devient « indisponible »).
     *
     * @param  list<int>  $ids
     * @return Collection<int, Model> par identifiant
     */
    public static function charger(string $type, array $ids): Collection
    {
        $entree = self::entree($type);

        return $entree['modele']::query()->whereKey($ids)->with($entree['charger'])->get()->keyBy(fn (Model $m) => (int) $m->getKey());
    }

    /** @return array{modele: class-string<Model>, lecture: string, via?: string, publique?: bool, sujet: bool, posable?: bool, projection: list<string>, charger: list<string>} */
    private static function entree(string $type): array
    {
        if (! array_key_exists($type, self::TABLE)) {
            throw new LogicException("Type hors du registre des sujets du fil : « {$type} ».");
        }

        return self::TABLE[$type];
    }
}
