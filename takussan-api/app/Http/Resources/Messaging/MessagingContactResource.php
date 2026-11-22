<?php

namespace App\Http\Resources\Messaging;

use App\Http\Resources\Bases\BaseResource;
use App\Models\User;
use App\Services\Messaging\MessagingRelation;
use Illuminate\Http\Request;

/**
 * TCK-565 — une personne joignable, telle que le sélecteur de participants l'affiche.
 *
 * ⚠️ **Cette ressource est une LISTE BLANCHE, et c'est son rôle.** L'endpoint ne passe PAS par
 * `HasQueryBuilder` (dont `User::$queryFields` ouvrirait `email` et `phone`, utiles aux consoles
 * d'administration) : `MessagingContactController` monte son propre `QueryBuilder` spatie, borné à
 * `fields[users]=id,first_name,last_name`, et tout paramètre hors liste rend 400. Rien d'autre que
 * le nom et l'avatar ne sort d'ici : les coordonnées d'un correspondant ne sont pas une donnée de
 * la messagerie. `MessagingContactsTest` l'épingle.
 *
 * P51.03 — le nom suit la règle de TCK-815, {@see User::nameWithoutContact()} : prénom
 * et nom, puis `username`, puis « — ». Un compte ouvert par téléphone n'a ni prénom ni nom, et
 * `full_name` rendait une ligne vide. Le contrôleur charge `username` pour ce repli seul.
 */
class MessagingContactResource extends BaseResource
{
    private ?string $relation = null;

    /** @var array<string, mixed>|null */
    private ?array $detail = null;

    /**
     * TCK-2745 — la relation avec l'appelant et sa ligne de détail, calculées pour la page entière
     * par {@see MessagingRelation} (jamais par personne). Des DONNÉES, jamais une phrase : le rôle,
     * un compte de biens, le titre et la ville d'un bien — aucune coordonnée.
     *
     * @param  array<string, mixed>|null  $detail
     */
    public function avecRelation(?string $relation, ?array $detail): static
    {
        $this->relation = $relation;
        $this->detail = $detail;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->nameWithoutContact(),
            'avatar_url' => $this->avatarUrl(),
            'relation' => $this->relation,
            'detail' => $this->detail,
        ];
    }
}
