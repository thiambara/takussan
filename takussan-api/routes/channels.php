<?php

use App\Models\User;
use App\Support\TempsReel\CanauxTempsReel;
use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Canaux temps réel — TCK-2952 (ADR-0129 § 2)
|--------------------------------------------------------------------------
|
| Deux familles, et rien d'autre :
|   - `sujet.{type}.{id}` : un objet du registre fermé `CanauxTempsReel`, jugé par SA règle de lecture.
|     Le même canal sert en privé (`private-sujet.*`, les signaux) et en présence (`presence-sujet.*`).
|   - `utilisateur.{id}` : ce qui ne regarde qu'une personne — soi-même, et personne d'autre.
|
| Le `type` venu du client est cherché dans le registre AVANT toute résolution ; aucun nom venu du client
| n'est appelé comme méthode ni comme classe. `{type}` et `{id}` restent des chaînes : ni liaison implicite
| de modèle, ni conversion qui lèverait. Un membre de présence ne publie que son identifiant.
|
| Chargé par `withBroadcasting()` (`bootstrap/app.php`) : la route d'autorisation est
| `/api/broadcasting/auth`, sous `api` et `auth:sanctum`. Aucune autorisation sous impersonation, quel que
| soit le verbe (cf. `CanauxTempsReel::autoriserSujet`).
*/

Broadcast::channel('sujet.{type}.{id}', fn (User $user, string $type, string $id) => CanauxTempsReel::autoriserSujet($user, $type, $id));

Broadcast::channel('utilisateur.{id}', fn (User $user, string $id) => CanauxTempsReel::autoriserUtilisateur($user, $id));
