<?php

namespace App\Services\Messaging;

use App\Http\Resources\BookingResource;
use App\Http\Resources\InventoryResource;
use App\Http\Resources\LeasePaymentResource;
use App\Http\Resources\LeaseResource;
use App\Http\Resources\MaintenanceRequestResource;
use App\Http\Resources\PropertyResource;
use App\Http\Resources\PropertyVisitResource;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use App\Services\Inventory\InventorySignatureService;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Visit\VisitReadContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use LogicException;

/**
 * TCK-2958 (ADR-0128 § 3) — la RELECTURE des objets d'une page de messages, pour son lecteur, sur le
 * patron de {@see FaitsDesMessages} : calculée une fois par page, jamais une fois par message.
 *
 *  - les objets que les cartes et les événements de la page désignent (`metadata.object`) sont
 *    chargés en UNE requête par type, avec les relations que leur projection demande
 *    ({@see SujetsDuFil::charger()}) ; un objet désigné par dix messages n'est jugé qu'une fois ;
 *  - chaque objet est jugé par sa politique (`view`, {@see SujetsDuFil::peutLire()}) POUR LE LECTEUR ;
 *  - lu : la PROJECTION de l'objet — la ressource existante de l'objet résolue pour ce lecteur, comme
 *    son `show` la lui rend, réduite aux clés que le registre déclare ({@see SujetsDuFil::projection()}) ;
 *  - sinon : `{indisponible: true}` et RIEN d'autre. Même réponse pour un objet supprimé, absent, d'un
 *    type hors registre, ou une référence mal formée : la relecture échoue fermée, sans lever.
 *
 * Le lecteur est l'auteur de la requête (`$request->user()`) : les ressources jugent par lui.
 */
final class ObjetsDesMessages
{
    /** Ce que reçoit un lecteur qui ne lit pas l'objet, et rien de plus. */
    public const INDISPONIBLE = ['indisponible' => true];

    /** @param  array<string, array<string, mixed>>  $projections  `type:id` → projection */
    private function __construct(private readonly array $projections) {}

    /** Aucune relecture (la recherche transverse, un message ordinaire) : tout objet est indisponible. */
    public static function aucun(): self
    {
        return new self([]);
    }

    /** @param  Collection<int, Message>  $messages */
    public static function pour(User $lecteur, Collection $messages, Request $request): self
    {
        $ids = [];
        foreach ($messages as $message) {
            $reference = self::reference($message);
            if ($reference !== null) {
                $ids[$reference[0]][$reference[1]] = $reference[1];
            }
        }
        if ($ids === []) {
            return self::aucun();
        }

        $charges = [];
        // TCK-2964 — les objets publiés de la page (le bien partagé), en une requête par type.
        $publics = [];
        foreach ($ids as $type => $deCeType) {
            $charges[$type] = SujetsDuFil::charger($type, array_values($deCeType));
            $publics[$type] = SujetsDuFil::publicsParmi($type, array_keys($charges[$type]->all()));
            self::preparer($type, $charges[$type], $request);
        }

        // Les politiques et les `abilities` jugent le personnel de l'agence de chaque objet : une
        // amorce pour toute la page (le chargement groupé que `MembershipCapabilityResolver::primed()`
        // documente, pas une mémoïsation de verdict), sans quoi ces jugements coûtent une requête par
        // objet et par geste (mesuré : 40 requêtes pour 1 événement, 238 pour 10, avant l'amorce).
        return MembershipCapabilityResolver::primed([$lecteur->id], self::agencesDe($charges, $lecteur), function () use ($charges, $publics, $lecteur, $request): self {
            $projections = [];
            foreach ($charges as $type => $objets) {
                foreach ($objets as $id => $objet) {
                    if (SujetsDuFil::peutLire($lecteur, $objet, $publics[$type])) {
                        $projections[$type.':'.$id] = self::filtrer(self::resoudre($type, $objet, $lecteur, $request), SujetsDuFil::projection($type));
                    }
                }
            }

            return new self($projections);
        });
    }

    /**
     * Les agences que les jugements de la page peuvent interroger : celle de chaque objet, de son bien
     * et de son bail (relations déjà chargées), et celle du profil actif du lecteur.
     *
     * @param  array<string, \Illuminate\Database\Eloquent\Collection<int, Model>>  $charges
     * @return list<int>
     */
    private static function agencesDe(array $charges, User $lecteur): array
    {
        $agences = [$lecteur->agency_id];
        foreach ($charges as $objets) {
            foreach ($objets as $objet) {
                $agences[] = $objet->getAttribute('agency_id');
                foreach (['property', 'lease'] as $relation) {
                    if ($objet->relationLoaded($relation)) {
                        $agences[] = $objet->getRelation($relation)?->getAttribute('agency_id');
                    }
                }
            }
        }

        return array_values(array_unique(array_map('intval', array_filter($agences, fn ($id) => $id !== null))));
    }

    /** @return array<string, mixed> la projection de l'objet du message, ou {@see self::INDISPONIBLE} */
    public function objetDe(Message $message): array
    {
        $reference = self::reference($message);

        return $reference === null ? self::INDISPONIBLE : ($this->projections[$reference[0].':'.$reference[1]] ?? self::INDISPONIBLE);
    }

    /** Le message porte-t-il un objet ? (`card` ou `event`) */
    public static function porteUnObjet(Message $message): bool
    {
        return in_array($message->type, [MessageType::Card, MessageType::Event], true);
    }

    /**
     * Ne garde que les chemins déclarés : `cle`, ou `bloc.cle` (un bloc imbriqué n'est jamais rendu
     * entier par un chemin `bloc.cle`). Une clé que la ressource n'a pas rendue à CE lecteur reste
     * absente : la projection n'ajoute rien à ce qu'il lit déjà.
     *
     * @param  array<string, mixed>  $resolu
     * @param  list<string>  $chemins
     * @return array<string, mixed>
     */
    public static function filtrer(array $resolu, array $chemins): array
    {
        $projection = [];
        foreach ($chemins as $chemin) {
            [$tete, $sous] = array_pad(explode('.', $chemin, 2), 2, null);
            if (! array_key_exists($tete, $resolu)) {
                continue;
            }
            $valeur = $resolu[$tete];
            if ($sous === null) {
                $projection[$tete] = $valeur;
            } elseif ($valeur === null) {
                $projection[$tete] = null;
            } elseif (is_array($valeur)) {
                $projection[$tete] ??= [];
                if (array_key_exists($sous, $valeur)) {
                    $projection[$tete][$sous] = $valeur[$sous];
                }
            }
        }

        return $projection;
    }

    /** @return array{0: string, 1: int}|null le type (du registre) et l'identifiant de l'objet du message */
    private static function reference(Message $message): ?array
    {
        if (! self::porteUnObjet($message)) {
            return null;
        }
        $objet = $message->metadata['object'] ?? null;
        $type = is_array($objet) ? ($objet['type'] ?? null) : null;
        $id = is_array($objet) ? ($objet['id'] ?? null) : null;
        if (! is_string($type) || ! in_array($type, SujetsDuFil::types(), true) || ! is_int($id) && ! ctype_digit((string) $id)) {
            return null;
        }

        return [$type, (int) $id];
    }

    /**
     * Ce que la page prépare une fois pour tous les objets d'un type (comme la liste de leur `show`).
     *
     * @param  iterable<Model>  $objets
     */
    private static function preparer(string $type, iterable $objets, Request $request): void
    {
        if ($type === 'property_visit') {
            VisitReadContext::prime($request, $objets);
        }
    }

    /**
     * La ressource de l'objet résolue pour le lecteur, comme son `show` la lui rend, puis normalisée en
     * tableau (les ressources imbriquées comprises). Un `match` sans défaut : un type ajouté au registre
     * sans sa résolution lève.
     *
     * @return array<string, mixed>
     */
    private static function resoudre(string $type, Model $objet, User $lecteur, Request $request): array
    {
        $ressource = match ($type) {
            'maintenance_request' => MaintenanceRequestResource::make($objet)->avecGestes(),
            'lease' => LeaseResource::make($objet)->forViewer($lecteur),
            'booking' => BookingResource::make($objet)->avecGestes($lecteur),
            'lease_payment' => LeasePaymentResource::make($objet)->avecGestes($lecteur),
            'inventory' => InventoryResource::make($objet)->forViewer($lecteur, app(InventorySignatureService::class)),
            'property_visit' => PropertyVisitResource::make($objet)->avecGestes(),
            // TCK-2964 — le bien partagé : sa ressource, avec les gestes du lecteur (`request_visit`).
            'property' => PropertyResource::make($objet)->avecGestes(),
            default => throw new LogicException("Type sans résolution de projection : « {$type} »."),
        };

        $resolu = json_decode((string) json_encode($ressource->resolve($request)), true);

        return is_array($resolu) ? $resolu : [];
    }
}
