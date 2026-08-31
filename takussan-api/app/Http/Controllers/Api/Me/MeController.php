<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\Me\UpdateMeRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * TCK-253 — Partial PATCH on the authenticated user's profile.
 *
 * Distinct from `PUT /api/auth/profile` (which requires `first_name` and
 * `last_name` on every call). This endpoint accepts the small set of
 * personalisation fields exposed by the deferred minimal-profile sheet.
 *
 * Les clés de `preferences` vivent dans la colonne JSON plutôt que dans des
 * colonnes dédiées — ce sont des indices réglables par l'utilisateur, pas des
 * attributs de domaine. La liste fait foi une seule fois :
 * {@see UpdateMeRequest::PREFERENCE_FIELDS}.
 */
class MeController extends Controller
{
    public function update(UpdateMeRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($request->has('phone')) {
            $newPhone = $request->input('phone');
            $newPhone = $newPhone === '' ? null : $newPhone;
            // Mirror UpdateProfileRequest semantics: changing the phone
            // resets the verification status. Only touch `phone_verified_at`
            // if the value actually changed (avoids spurious resets).
            if ($user->phone !== $newPhone) {
                $user->phone = $newPhone;
                $user->phone_verified_at = null;
            }
        }

        // TCK-493 — la liste est EMPRUNTÉE à la requête, jamais recopiée : une
        // clé validée mais absente de cette boucle rendrait 200 sans rien
        // enregistrer, ce qui est la forme d'échec la plus difficile à voir.
        if ($request->hasAny(UpdateMeRequest::PREFERENCE_FIELDS)) {
            $current = is_array($user->preferences) ? $user->preferences : [];
            foreach (UpdateMeRequest::PREFERENCE_FIELDS as $field) {
                if (! $request->has($field)) {
                    continue;
                }
                $value = $request->input($field);
                if ($value === null || $value === '') {
                    unset($current[$field]);
                } else {
                    $current[$field] = $value;
                }
            }
            $user->preferences = $current === [] ? null : $current;
        }

        $user->save();

        return response()->json(['data' => new UserResource($user->fresh())]);
    }
}
