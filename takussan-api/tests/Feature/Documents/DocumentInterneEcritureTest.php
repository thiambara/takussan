<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2759 (ADR-0099, amendement du 2026-11-12, §§ 4, 5 et 7) — qui pose le drapeau interne, où, et ce
 * que la bascule emporte : le partage du sujet, et le journal.
 *
 * Fixture du ticket : l'agence A du coffre, la fiche C du locataire U, l'agent X d'A (téléverseur), un
 * second agent X2 d'A, le bailleur B d'A, un agent Y d'une autre agence.
 */
class DocumentInterneEcritureTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    private Customer $fiche;

    private User $agent2;

    private User $etranger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
        $this->fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $this->agent2 = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $this->agent2->id, 'agency_id' => $this->agency->id]);
        $this->etranger = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $this->etranger->id, 'agency_id' => Agency::factory()->create()->id]);
    }

    /** @param array<string, mixed> $extra */
    private function televerser(string $type, Model $cible, array $extra = []): TestResponse
    {
        return $this->post('/api/documents', [
            'documentable_type' => $type,
            'documentable_id' => $cible->getKey(),
            'name' => 'Note',
            'type' => DocumentType::Other->value,
            'file' => UploadedFile::fake()->create('note.pdf', 12, 'application/pdf'),
        ] + $extra, ['Accept' => 'application/json']);
    }

    private function deposeParX(bool $interne): Document
    {
        $this->connecter($this->agent);

        return Document::query()->findOrFail(
            $this->televerser('customer', $this->fiche, ['is_internal' => $interne ? '1' : '0'])->assertCreated()->json('data.id')
        );
    }

    private function basculer(Document $document, bool $interne): TestResponse
    {
        return $this->patchJson("/api/documents/{$document->id}/visibility", ['is_internal' => $interne]);
    }

    private function journalDeBascule(Document $document): int
    {
        return Activity::query()->where('subject_type', Document::class)->where('subject_id', $document->id)
            ->where('event', 'document_visibility_changed')->count();
    }

    /** AC7 — le sujet ne pose pas le drapeau (403) ; sans le champ, son dépôt est visible. */
    public function test_ac7_the_subject_cannot_keep_its_own_upload_internal(): void
    {
        $this->connecter($this->tenant);
        $avant = Document::query()->count();
        $this->televerser('customer', $this->fiche, ['is_internal' => '1'])->assertForbidden();
        $this->assertSame($avant, Document::query()->count());

        $sien = $this->televerser('customer', $this->fiche)->assertCreated();
        $this->assertFalse($sien->json('data.is_internal'));
        $this->assertDatabaseHas('documents', ['id' => $sien->json('data.id'), 'is_internal' => false]);

        // X ne rend pas interne la pièce que U a déposée : 422, et la ligne ne change pas.
        $this->connecter($this->agent);
        $doc = Document::query()->findOrFail($sien->json('data.id'));
        $this->basculer($doc, true)->assertUnprocessable()->assertJsonPath('code', 'document.internal_own_upload');
        $this->assertFalse($doc->fresh()->is_internal);
        $this->assertSame(0, $this->journalDeBascule($doc));
    }

    /**
     * TCK-2759 (r1 de la vérification de cd48b8f57) — `abilities.set_visibility` ne promet pas un geste
     * refusé : sur la pièce visible du sujet, la seule bascule serait « Garder pour l'agence », que
     * l'API refuse (422 `document.internal_own_upload`) ; elle ne s'offre donc ni à la ligne
     * (`GET /api/documents/{id}`), ni à la liste de la fiche, ni à la fiche (`include=documents`). Le
     * dépôt visible de X, lui, garde son offre. Une pièce du sujet restée interne (ligne héritée) offre
     * « Rendre visible », que l'API accepte.
     */
    public function test_r1_la_piece_visible_du_sujet_n_offre_pas_une_bascule_refusee(): void
    {
        $this->connecter($this->tenant);
        $sien = Document::query()->findOrFail($this->televerser('customer', $this->fiche)->assertCreated()->json('data.id'));
        $deX = $this->deposeParX(false);

        $offres = function (): array {
            $ligne = fn (Document $d): bool => $this->getJson("/api/documents/{$d->id}")->assertOk()->json('data.abilities.set_visibility');
            $liste = collect($this->getJson("/api/documents?filter[documentable_type]=customer&filter[documentable_id]={$this->fiche->id}")
                ->assertOk()->json('data'))->keyBy('id');
            $fiche = collect($this->getJson("/api/customers/{$this->fiche->id}?include=documents")->assertOk()->json('data.documents'))->keyBy('id');

            return [$ligne, $liste, $fiche];
        };

        $this->connecter($this->agent);
        [$ligne, $liste, $fiche] = $offres();
        $this->assertFalse($ligne($sien), 'la ligne');
        $this->assertFalse($liste[$sien->id]['abilities']['set_visibility'], 'la liste de la fiche');
        $this->assertFalse($fiche[$sien->id]['abilities']['set_visibility'], 'include=documents');
        $this->assertTrue($ligne($deX));
        $this->assertTrue($liste[$deX->id]['abilities']['set_visibility']);
        $this->assertTrue($fiche[$deX->id]['abilities']['set_visibility']);
        // Ce qui ne s'offre pas est bien ce qui se refuse.
        $this->basculer($sien, true)->assertUnprocessable()->assertJsonPath('code', 'document.internal_own_upload');

        // Une pièce du sujet restée interne (aucun écrivain ne la pose plus) : « Rendre visible » s'offre et passe.
        $sien->forceFill(['is_internal' => true])->save();
        [$ligne, , $fiche] = $offres();
        $this->assertTrue($ligne($sien));
        $this->assertTrue($fiche[$sien->id]['abilities']['set_visibility']);
        $this->basculer($sien, false)->assertOk()->assertJsonPath('data.is_internal', false);
        $this->assertFalse($ligne($sien));
    }

    /** AC7 — hors d'une fiche client, `is_internal=true` rend 422 et ne crée rien. */
    public function test_ac7_internal_only_holds_on_a_customer_fiche(): void
    {
        $booking = Booking::factory()->create(['property_id' => $this->property->id, 'customer_id' => $this->fiche->id, 'agency_id' => $this->agency->id]);
        $this->connecter($this->agent);
        $avant = Document::query()->count();

        foreach ([['lease', $this->lease], ['property', $this->property], ['booking', $booking], ['inventory', $this->signedInventory]] as [$type, $cible]) {
            $refus = $this->televerser($type, $cible, ['is_internal' => '1']);
            $this->assertSame(422, $refus->status(), "{$type} : ".$refus->json('code'));
            $refus->assertJsonPath('code', 'document.internal_customer_only');
            // Sans le champ, hors fiche : visible, comme avant le ticket.
            $this->assertFalse($this->televerser($type, $cible)->assertCreated()->json('data.is_internal'), $type);
        }
        $this->assertSame($avant + 4, Document::query()->count());

        // La bascule non plus : le personnel de l'agence passe la policy, et reçoit 422.
        $this->basculer($this->adminDocOnLease, true)->assertUnprocessable()->assertJsonPath('code', 'document.internal_customer_only');
        $this->assertFalse($this->adminDocOnLease->fresh()->is_internal);
    }

    /** AC8 — un agent d'A qui n'a pas téléversé D le bascule, et le journal le dit. */
    public function test_ac8_another_active_agent_toggles_it_and_the_log_says_so(): void
    {
        $doc = $this->deposeParX(true);

        $this->connecter($this->agent2);
        $this->basculer($doc, false)->assertOk()->assertJsonPath('data.is_internal', false);
        $this->assertFalse($doc->fresh()->is_internal);

        $entree = Activity::query()->where('subject_type', Document::class)->where('subject_id', $doc->id)
            ->where('event', 'document_visibility_changed')->sole();
        $this->assertSame($this->agent2->id, (int) $entree->causer_id);
        $this->assertTrue($entree->properties['from']);
        $this->assertFalse($entree->properties['to']);

        // Rien ne change, rien ne s'écrit.
        $this->basculer($doc, false)->assertOk();
        $this->assertSame(1, $this->journalDeBascule($doc));
    }

    /** AC8 — U, un bailleur d'A et Y : 403, sans entrée de journal. */
    public function test_ac8_the_subject_a_landlord_and_another_agency_cannot_toggle(): void
    {
        $doc = $this->deposeParX(true);

        foreach ([$this->tenant, $this->landlord, $this->etranger] as $qui) {
            $this->connecter($qui);
            $this->basculer($doc, false)->assertForbidden();
        }
        $this->assertTrue($doc->fresh()->is_internal);
        $this->assertSame(0, $this->journalDeBascule($doc));
    }

    /** AC6 — le sujet ne partage pas D ; il partage toujours un document visible ; X partage D. */
    public function test_ac6_the_subject_shares_only_what_is_visible(): void
    {
        $interne = $this->deposeParX(true);
        $visible = $this->deposeParX(false);

        $this->connecter($this->tenant);
        $this->postJson("/api/documents/{$interne->id}/share")->assertForbidden();
        $this->postJson("/api/documents/{$visible->id}/share")->assertCreated();

        $this->connecter($this->agent);
        $this->postJson("/api/documents/{$interne->id}/share")->assertCreated();
    }

    /** AC6 — rendre E interne révoque le lien du sujet (410 public), jamais celui du personnel. */
    public function test_ac6_turning_it_internal_revokes_the_subjects_links_only(): void
    {
        $e = $this->deposeParX(false);

        $this->connecter($this->tenant);
        $lienDeU = $this->postJson("/api/documents/{$e->id}/share")->assertCreated()->json('data');
        $this->connecter($this->agent);
        $lienDeX = $this->postJson("/api/documents/{$e->id}/share")->assertCreated()->json('data');

        $this->basculer($e, true)->assertOk()->assertJsonPath('data.is_internal', true);

        $this->assertNotNull(DocumentShareLink::query()->findOrFail($lienDeU['id'])->revoked_at);
        $this->assertNull(DocumentShareLink::query()->findOrFail($lienDeX['id'])->revoked_at);

        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->getJson("/api/share/{$lienDeU['token']}")->assertStatus(410)->assertJsonPath('code', 'share_link.revoked');
        $this->getJson("/api/share/{$lienDeX['token']}")->assertOk();
    }
}
