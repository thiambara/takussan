<?php

namespace App\Http\Requests\Concerns;

use App\Models\Booking;
use App\Models\Conversation;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-305 — règles d'autorisation évaluées dans `authorize()` d'un FormRequest, **en attendant
 * leur policy**.
 *
 * ## Pourquoi ce fichier existe, et pourquoi il doit disparaître
 *
 * TCK-305 a déplacé 120 validations en ligne vers des FormRequest. La validation d'un FormRequest
 * court **avant** le corps du contrôleur : les 65 méthodes qui autorisaient d'abord se sont donc
 * mises à rendre **422 au lieu de 403** pour un appel à la fois non autorisé et mal formé. Hors
 * contrat (le ticket exige « mêmes codes de réponse »), et un renseignement gratuit — noms de
 * champs, contraintes, énumérations — offert à qui n'a aucun droit sur la ressource.
 *
 * Le correctif porte l'autorisation dans `authorize()`, qui s'exécute avant la validation.
 * **Pour 35 des 65 sites, c'est une simple délégation** : `$this->user()->can('update', …)`, la
 * règle restant dans sa policy. Les 30 autres portent des règles qui ne sont **pas encore** dans
 * une policy — ce sont les 19 helpers relevés hors périmètre de TCK-306, que le ticket de suite
 * doit migrer.
 *
 * Les trois règles ci-dessous étaient partagées par plusieurs classes sœurs : les recopier aurait
 * refait, dans `app/Http/Requests/`, exactement la duplication que TCK-306 vient de défaire dans
 * `app/Http/Controllers/`. Elles ont donc **un** domicile, provisoire et nommé comme tel.
 *
 * ⚠ **Ce trait est une étape, pas une destination.** Chacune de ces méthodes doit devenir une
 * ability de policy — `ConversationPolicy`, `AgentProfilePolicy`, `OwnerProfilePolicy`,
 * `Profiles\ServiceProviderProfilePolicy`, `BookingPolicy` existent déjà — et `authorize()` doit
 * alors ne plus faire que déléguer, comme les 35 autres. *Une classe qui annonce sa propre
 * péremption est moins dangereuse qu'une classe qui s'installe en silence.*
 */
trait AuthorizesTransitionally
{
    /**
     * Reprise de `ConversationController::ensureParticipant()`.
     *
     * `left_at != null` signifie que l'utilisateur a quitté le groupe : il n'y a plus accès
     * (TCK-085). C'est la clause qui distingue « a été membre » de « est membre ».
     */
    protected function isActiveParticipant(?Conversation $conversation): bool
    {
        $user = $this->user();

        if ($user === null || $conversation === null) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        return $conversation->participants()
            ->where('user_id', $user->id)
            ->wherePivotNull('left_at')
            ->exists();
    }

    /**
     * Reprise de `assertOwner()` — identique dans `Me\AgentProfileController`,
     * `Me\OwnerProfileController` et `Me\ServiceProviderProfileController`, à la classe du profil
     * près : on n'agit que sur SON propre profil.
     */
    protected function ownsProfile(?Model $profile): bool
    {
        $user = $this->user();

        if ($user === null || $profile === null) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        return (int) $profile->getAttribute('user_id') === (int) $user->id;
    }

    /**
     * Reprise de `BookingPaymentController::authorizeBookingManage()`.
     *
     * ⚠ Elle N'EST PAS `BookingPolicy::update` : elle ajoute le CLIENT de la réservation
     * (TCK-172 — le client crée lui-même son paiement en attente pour lancer le règlement depuis
     * `/app/bookings/[id]`). Déléguer à `update` aurait fermé ce chemin. C'est précisément le
     * genre d'écart qu'on ne voit qu'en lisant les deux règles côte à côte.
     */
    protected function canManageBooking(?Booking $booking): bool
    {
        $user = $this->user();

        if ($user === null || $booking === null) {
            return false;
        }

        $property = $booking->property;

        return $user->isSuperAdmin()
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $user->agency_id === $booking->agency_id)
            || ($booking->customer && $booking->customer->user_id === $user->id);
    }
}
