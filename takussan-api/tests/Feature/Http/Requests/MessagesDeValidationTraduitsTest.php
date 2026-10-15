<?php

namespace Tests\Feature\Http\Requests;

use App\Http\Requests\Agency\AssignAgencyRoleRequest;
use App\Http\Requests\Agency\SyncCapabilitiesRequest;
use App\Http\Requests\Api\StorePropertyMediaRequest;
use App\Http\Requests\InventorySignRequest;
use App\Http\Requests\Permissions\StoreRoleDelegationRequest;
use App\Http\Requests\RejectPropertyRequest;
use App\Http\Requests\SignatureDataUrlRule;
use App\Models\Enums\Capability;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;
use Tests\Unit\Architecture\ProseLitteraleInterditeTest;

/**
 * TCK-656 (piste P06.04) — six FormRequests rendaient leurs erreurs en français quelle que soit la
 * langue de la requête : 14 phrases écrites en dur, et cinq messages qui injectaient un nom de champ
 * français dans le gabarit de la langue active (« The utilisateur field is required. »).
 *
 * Le français ne change pas d'une lettre (AC1) ; l'anglais et le wolof ne le recopient plus (AC2,
 * AC3). La garde statique qui empêche le retour du motif est {@see ProseLitteraleInterditeTest},
 * formes (h) et (i).
 */
class MessagesDeValidationTraduitsTest extends TestCase
{
    /**
     * Les 14 phrases, dans leur texte français d'avant le ticket.
     *
     * @return array<string, array{0: string, 1: string}>
     */
    public static function phrases(): array
    {
        return [
            'media.required' => ['media.required', 'Sélectionnez au moins une photo.'],
            'media.image' => ['media.image', 'Le fichier doit être une image lisible.'],
            'media.mimes' => ['media.mimes', 'Formats acceptés : JPG, PNG ou WebP.'],
            'media.max' => ['media.max', 'Chaque photo doit peser 10 Mo maximum.'],
            'rejet.required' => ['rejet.required', 'Une raison de rejet est obligatoire.'],
            'rejet.min' => ['rejet.min', 'La raison doit contenir au moins 20 caractères.'],
            'rejet.max' => ['rejet.max', 'La raison ne peut pas dépasser 1000 caractères.'],
            'role_agence.in' => ['role_agence.in', 'Ce type de profil ne porte pas de rôle d\'agence.'],
            'capacites.not_in' => ['capacites.not_in', 'Cette capacité est réservée à la plateforme : aucun rôle d\'agence ne peut la porter.'],
            'signature.invalide' => ['signature.invalide', 'La signature est invalide.'],
            'signature.prefixe' => ['signature.prefixe', 'La signature doit être un PNG base64 (data:image/png;base64,...).'],
            'signature.base64' => ['signature.base64', 'La signature contient des caractères base64 invalides.'],
            'signature.taille' => ['signature.taille', 'La signature est vide ou trop petite.'],
            'signature.png' => ['signature.png', 'La signature n\'est pas un PNG valide.'],
        ];
    }

    /** Le message que rend le cas `$cas` dans la langue active. */
    private function message(string $cas): string
    {
        return match ($cas) {
            'media.required' => $this->erreur(new StorePropertyMediaRequest, [], 'photos'),
            'media.image' => $this->erreur(new StorePropertyMediaRequest, $this->photoInvalide(), 'photos.0', 0),
            'media.mimes' => $this->erreur(new StorePropertyMediaRequest, $this->photoInvalide(), 'photos.0', 1),
            'media.max' => $this->erreur(new StorePropertyMediaRequest, $this->photoInvalide(), 'photos.0', 2),
            'rejet.required' => $this->erreur(new RejectPropertyRequest, [], 'rejection_reason'),
            'rejet.min' => $this->erreur(new RejectPropertyRequest, ['rejection_reason' => 'trop court'], 'rejection_reason'),
            'rejet.max' => $this->erreur(new RejectPropertyRequest, ['rejection_reason' => str_repeat('a', 1001)], 'rejection_reason'),
            'role_agence.in' => $this->erreur(new AssignAgencyRoleRequest, ['profile_type' => 'inconnu'], 'profile_type'),
            'capacites.not_in' => $this->erreur(new SyncCapabilitiesRequest, ['capabilities' => [Capability::platformReserved()[0]->value]], 'capabilities.0'),
            'signature.invalide' => $this->signature(123),
            'signature.prefixe' => $this->signature('http://exemple.test/x.png'),
            'signature.base64' => $this->signature(InventorySignRequest::SIGNATURE_PREFIX.'@@@'),
            'signature.taille' => $this->signature(InventorySignRequest::SIGNATURE_PREFIX.base64_encode('abc')),
            'signature.png' => $this->signature(InventorySignRequest::SIGNATURE_PREFIX.base64_encode(str_repeat('A', 80))),
        };
    }

    /** @param array<string, mixed> $data */
    private function erreur(FormRequest $request, array $data, string $champ, int $rang = 0): string
    {
        $erreurs = Validator::make($data, $request->rules(), $request->messages(), $request->attributes())
            ->errors()->get($champ);

        $this->assertArrayHasKey($rang, $erreurs, "aucune erreur n° {$rang} sur {$champ}");

        return $erreurs[$rang];
    }

    /** @return array<string, mixed> */
    private function photoInvalide(): array
    {
        // Un PDF de 20 Mo : ni image, ni au bon format, ni sous 10 Mo — trois erreurs, dans l'ordre des règles.
        return ['photos' => [UploadedFile::fake()->create('acte.pdf', 20000, 'application/pdf')]];
    }

    private function signature(mixed $valeur): string
    {
        // La règle vit dans le fichier de la requête : le charger d'abord.
        class_exists(InventorySignRequest::class);
        $messages = [];
        (new SignatureDataUrlRule)->validate('signature', $valeur, function ($message) use (&$messages) {
            $messages[] = (string) $message;
        });

        $this->assertCount(1, $messages);

        return $messages[0];
    }

    #[DataProvider('phrases')]
    public function test_le_francais_ne_change_pas(string $cas, string $francais): void
    {
        app()->setLocale('fr');

        $this->assertSame($francais, $this->message($cas));
    }

    #[DataProvider('phrases')]
    public function test_l_anglais_et_le_wolof_ne_recopient_pas_le_francais(string $cas, string $francais): void
    {
        foreach (['en', 'wo'] as $langue) {
            app()->setLocale($langue);
            $message = $this->message($cas);

            $this->assertNotSame($francais, $message, "{$cas} rendu en français en `{$langue}`");
            $this->assertDoesNotMatchRegularExpression('/^[a-z_]+(\.[a-z_]+)+$/', $message, "{$cas} rend une clé brute en `{$langue}`");
        }
    }

    /** @return array<string, array{0: string, 1: string}> */
    private function delegation(): array
    {
        $request = new StoreRoleDelegationRequest;
        $erreurs = Validator::make(
            ['starts_at' => '2026-10-10', 'ends_at' => '2026-10-01', 'reason' => str_repeat('a', 501)],
            $request->rules(),
            $request->messages(),
            $request->attributes(),
        )->errors();

        return [
            'user_id.required' => $erreurs->first('user_id'),
            'role.required' => $erreurs->first('role'),
            'ends_at.after' => $erreurs->get('ends_at')[0],
            'reason.max' => $erreurs->first('reason'),
            'ends_at.required' => Validator::make([], ['ends_at' => $request->rules()['ends_at']], $request->messages(), $request->attributes())
                ->errors()->first('ends_at'),
        ];
    }

    public function test_la_delegation_garde_son_texte_francais(): void
    {
        app()->setLocale('fr');

        $this->assertSame([
            'user_id.required' => 'Le champ utilisateur est obligatoire.',
            'role.required' => 'Le champ rôle est obligatoire.',
            'ends_at.after' => 'Le champ date de fin doit être une date postérieure à date de début.',
            'reason.max' => 'Le champ motif ne peut pas contenir plus de 500 caractères.',
            'ends_at.required' => 'Le champ date de fin est obligatoire.',
        ], $this->delegation());
    }

    public function test_la_delegation_n_injecte_plus_de_nom_de_champ_francais(): void
    {
        foreach (['en', 'wo'] as $langue) {
            app()->setLocale($langue);

            foreach ($this->delegation() as $regle => $message) {
                $this->assertDoesNotMatchRegularExpression('/utilisateur|rôle|date de fin|date de début|motif/u', $message, "{$regle} en `{$langue}` : {$message}");
            }
        }
    }
}
