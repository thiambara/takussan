<?php

namespace App\Services\Messaging;

use App\Models\Booking;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\User;
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
 * Ajouter un type : une ligne ici. S'il est sujet, l'observateur `FermeLeFilDeSonObjet` le couvre
 * sans autre code (branché par une boucle dans `AppServiceProvider::bootObservers()`). Les tickets
 * des cartes (TCK-2958, TCK-2961, TCK-2964) y ajoutent des types qui ne sont pas des sujets.
 */
final class SujetsDuFil
{
    /**
     * @var array<string, array{modele: class-string<Model>, lecture: string, sujet: bool}>
     */
    private const TABLE = [
        'maintenance_request' => ['modele' => MaintenanceRequest::class, 'lecture' => 'view', 'sujet' => true],
        'lease' => ['modele' => Lease::class, 'lecture' => 'view', 'sujet' => true],
        'booking' => ['modele' => Booking::class, 'lecture' => 'view', 'sujet' => true],
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

    /** Le lecteur lit-il cet objet ? La politique de l'objet en décide (`view`). */
    public static function peutLire(User $lecteur, Model $objet): bool
    {
        return $lecteur->can(self::TABLE[self::typeDe($objet)]['lecture'], $objet);
    }

    /** @return array{modele: class-string<Model>, lecture: string, sujet: bool} */
    private static function entree(string $type): array
    {
        if (! array_key_exists($type, self::TABLE)) {
            throw new LogicException("Type hors du registre des sujets du fil : « {$type} ».");
        }

        return self::TABLE[$type];
    }
}
