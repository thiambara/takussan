<?php

namespace Tests\Feature\Documents;

use App\Models\Enums\DocumentType;
use App\Models\Profiles\OwnerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\CoffreDeDocuments;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-2655 (ADR-0099, ADR-0055) — sous impersonation, le coffre suit `DocumentPolicy::view` : les
 * pièces rattachées à un PROFIL n'y sont pas (TCK-697), le reste y est ; et rien ne s'y joint
 * (`attachable_targets` vide : l'impersonation est en lecture seule).
 *
 * Chaque cas porte son versant autorisé : la cible, sous son propre jeton, voit sa pièce et ses
 * cibles de rattachement — sans lui, un coffre vide rendrait le test vert.
 */
class DocumentVaultImpersonationTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;
    use SessionsDImpersonation;

    public function test_the_profile_pieces_and_the_attachable_targets_are_withheld(): void
    {
        $this->batirLeCoffre();
        $profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->sole();
        $profilePiece = $this->document($profile, $this->landlord, DocumentType::IdCard, 'CNI du bailleur');
        $accountPiece = $this->document($this->landlord, $this->landlord, DocumentType::Other, 'Mandat de gestion');

        // Versant autorisé : le bailleur sous son propre jeton.
        $this->connecter($this->landlord, $profile);
        $own = $this->coffre();
        $ownIds = array_column($this->entrees($own), 'document_id');
        $this->assertContains($profilePiece->id, $ownIds);
        $this->assertContains($accountPiece->id, $ownIds);
        $this->assertContains($this->adminDocOnLease->id, $ownIds);
        $this->assertNotSame([], $own['attachable_targets']);

        $session = $this->ouvrirUneSession(cible: $this->landlord);
        $this->avecLeJeton($session['jeton']);
        $impersonated = $this->coffre();
        $ids = array_column($this->entrees($impersonated), 'document_id');

        $this->assertNotContains($profilePiece->id, $ids);
        $this->assertContains($accountPiece->id, $ids);
        $this->assertContains($this->adminDocOnLease->id, $ids);
        $this->assertSame([], $impersonated['attachable_targets']);
        // Les générés restent : la lecture est permise, seule l'écriture ne l'est pas.
        $this->assertContains("/api/leases/{$this->lease->id}/contract/pdf", $this->chemins($impersonated));
        // Et la liste suit la lecture : ce qui est retenu est refusé à l'ouverture.
        $this->getJson("/api/documents/{$profilePiece->id}")->assertForbidden();
        foreach ($this->chemins($impersonated) as $path) {
            $this->assertSame(200, $this->get($path)->getStatusCode(), $path);
        }
    }

    public function test_the_tenant_vault_under_impersonation_keeps_its_receipts(): void
    {
        $this->batirLeCoffre();

        $session = $this->ouvrirUneSession(cible: $this->tenant);
        $this->avecLeJeton($session['jeton']);
        $vault = $this->coffre();

        $this->assertCount(6, array_filter($this->entrees($vault), fn (array $e) => str_starts_with($e['category'], 'receipt_')));
        $this->assertContains($this->idCard->id, array_column($this->entrees($vault), 'document_id'));
        $this->assertSame([], $vault['attachable_targets']);
    }
}
