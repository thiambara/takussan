<?php

namespace Tests\Feature\Models;

use App\Models\User;
use Tests\TestCase;

/**
 * Le modèle `User`, par ses accesseurs. TCK-3017 : ex-`Unit/ModelsTest`, dont seul `full_name` éprouvait du
 * code du dépôt (les types de relations sont exécutés contre le schéma par `ModelRelationsExecuteTest`) ;
 * mesuré par ablation : ni `PropertyCollaboratorTest`, ni `ConversationThreadContextTest`, ni `PublicProfileTest`, qui affichent des noms, ne rougissent quand `full_name` perd le nom de famille.
 */
class UserTest extends TestCase
{
    public function test_full_name_joint_le_prenom_et_le_nom(): void
    {
        $this->assertSame('John Doe', (new User(['first_name' => 'John', 'last_name' => 'Doe']))->full_name);
        $this->assertSame('John', (new User(['first_name' => 'John', 'last_name' => null]))->full_name);
    }
}
