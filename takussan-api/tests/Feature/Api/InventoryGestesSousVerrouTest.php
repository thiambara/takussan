<?php

namespace Tests\Feature\Api;

use App\Exceptions\ApiError;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Services\Model\InventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * P211.05 (TCK-2109) — `update`, `submit`, `dispute`, l'ajout et le retrait d'une photo de pièce
 * jugent le statut sur la ligne relue sous verrou, comme `InventorySignatureService::sign`. Ils le
 * jugeaient sur le modèle lié : une modification partie d'un brouillon resté en mémoire changeait
 * le contenu d'un état des lieux qu'une partie venait de signer.
 *
 * La course se rejoue sans concurrence : le geste reçoit un modèle chargé avant la signature.
 */
class InventoryGestesSousVerrouTest extends TestCase
{
    use RefreshDatabase;

    private const PIECES = [['name' => 'Living room', 'condition' => 'good', 'notes' => null]];

    /** Un brouillon chargé, puis signé par le locataire en base derrière lui. */
    private function brouillonSigneDerriere(): Inventory
    {
        $inventory = Inventory::factory()->create(['rooms' => self::PIECES]);
        $perime = Inventory::query()->findOrFail($inventory->id);
        Inventory::query()->whereKey($inventory->id)->update([
            'status' => InventoryStatus::PendingSignature->value,
            'tenant_signed' => true,
        ]);

        return $perime;
    }

    private function assertRefus(callable $geste, int $statut, string $code): void
    {
        try {
            $geste();
            $this->fail("Le geste aurait dû être refusé par {$code}.");
        } catch (ApiError $e) {
            $this->assertSame($statut, $e->getStatusCode());
            $this->assertSame($code, $e->errorCode);
        }
    }

    public function test_une_modification_sur_un_brouillon_perime_apres_une_signature_est_refusee(): void
    {
        $perime = $this->brouillonSigneDerriere();

        $this->assertRefus(
            fn () => app(InventoryService::class)->update($perime, ['rooms' => [['name' => 'Kitchen', 'condition' => 'poor', 'notes' => null]]], ['rooms' => true]),
            422,
            'inventory.not_draft',
        );

        $ligne = Inventory::query()->findOrFail($perime->id);
        $this->assertEquals(self::PIECES, $ligne->rooms);
        $this->assertTrue((bool) $ligne->tenant_signed);
    }

    public function test_une_modification_sur_un_brouillon_perime_d_un_etat_signe_rend_409(): void
    {
        $inventory = Inventory::factory()->create(['rooms' => self::PIECES]);
        $perime = Inventory::query()->findOrFail($inventory->id);
        Inventory::query()->whereKey($inventory->id)->update(['status' => InventoryStatus::Signed->value]);

        $this->assertRefus(
            fn () => app(InventoryService::class)->update($perime, ['notes' => 'ajout'], ['notes' => true]),
            409,
            'inventory.signed_locked',
        );

        $this->assertNull(Inventory::query()->findOrFail($inventory->id)->notes);
    }

    public function test_une_soumission_sur_un_brouillon_perime_d_un_etat_signe_est_refusee(): void
    {
        $inventory = Inventory::factory()->create();
        $perime = Inventory::query()->findOrFail($inventory->id);
        Inventory::query()->whereKey($inventory->id)->update(['status' => InventoryStatus::Signed->value]);

        $this->assertRefus(fn () => app(InventoryService::class)->submit($perime), 422, 'inventory.not_draft_submit');

        $this->assertSame(InventoryStatus::Signed, Inventory::query()->findOrFail($inventory->id)->status);
    }

    public function test_une_seconde_contestation_sur_un_modele_perime_est_refusee(): void
    {
        $inventory = Inventory::factory()->pendingSignature()->create();
        $perime = Inventory::query()->findOrFail($inventory->id);
        $service = app(InventoryService::class);

        $service->dispute($inventory, 'compteur faux');
        $this->assertRefus(fn () => $service->dispute($perime, 'mur abîmé'), 422, 'inventory.cannot_dispute');

        $this->assertSame('[Dispute] compteur faux', Inventory::query()->findOrFail($inventory->id)->notes);
    }

    public function test_une_photo_ajoutee_a_un_brouillon_perime_apres_une_signature_est_refusee(): void
    {
        $perime = $this->brouillonSigneDerriere();

        $this->assertRefus(
            fn () => app(InventoryService::class)->addRoomPhotos($perime, [UploadedFile::fake()->image('a.jpg')], 'Living room'),
            422,
            'inventory.not_draft',
        );

        $this->assertCount(0, Inventory::query()->findOrFail($perime->id)->getMedia('room_photos'));
    }

    public function test_une_photo_retiree_d_un_brouillon_perime_apres_une_signature_est_refusee(): void
    {
        $inventory = Inventory::factory()->create(['rooms' => self::PIECES]);
        $photo = $inventory->addMedia(UploadedFile::fake()->image('a.jpg'))
            ->withCustomProperties(['room_name' => 'Living room'])
            ->toMediaCollection('room_photos');
        $perime = Inventory::query()->findOrFail($inventory->id);
        Inventory::query()->whereKey($inventory->id)->update(['status' => InventoryStatus::PendingSignature->value]);

        $this->assertRefus(fn () => app(InventoryService::class)->removeRoomPhoto($perime, $photo), 422, 'inventory.not_draft');

        $this->assertCount(1, Inventory::query()->findOrFail($inventory->id)->getMedia('room_photos'));
    }

    public function test_un_brouillon_se_modifie_et_recoit_ses_photos(): void
    {
        $inventory = Inventory::factory()->create(['rooms' => self::PIECES]);
        $service = app(InventoryService::class);

        $rendu = $service->update($inventory, ['notes' => 'ok'], ['notes' => true]);
        $service->addRoomPhotos($inventory, [UploadedFile::fake()->image('a.jpg')], 'Living room');

        $this->assertSame('ok', $rendu->notes);
        $this->assertCount(1, $inventory->refresh()->getMedia('room_photos'));
    }
}
