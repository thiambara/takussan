<?php

namespace App\Services\Radar;

use App\Domain\Features\Flag;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\RadarAdvertiser;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Features\FeatureFlagEvaluator;

/**
 * TCK-2394 (ADR-0079, PROPOSÉ) — la publication sous mandat
 * Takussan : un annonceur d'accord qui ne veut pas de compte confie la diffusion de ses annonces à Takussan, qui les publie
 * dans son propre espace. Deux interrupteurs, tous deux de la console, par environnement :
 *  - le drapeau `radar_mandate`, ÉTEINT tant qu'aucune ligne ne l'allume (aucune migration ne l'allume) — rien ne se publie
 *    sous mandat avant l'acceptation de l'ADR ;
 *  - le réglage `radar.mandate_agency_id`, l'espace des mandats (0 : aucun). Il doit exister, n'être pas suspendu, et avoir
 *    un administrateur principal : les biens naissent avec lui pour auteur.
 *
 * Les gardes de la publication elle-même (accord relu sous verrou, étape, photos, champs, plafond, quota, STOP, prise en
 * charge) sont celles de « publier pour lui » ({@see RadarPublisher::publishUnderMandate()}).
 */
final class RadarMandate
{
    public const DISABLED = 'radar.mandate.disabled';

    public const SPACE_MISSING = 'radar.mandate.space_missing';

    public const ACCOUNT_EXISTS = 'radar.mandate.account_exists';

    public function __construct(
        private readonly FeatureFlagEvaluator $flags,
        private readonly PlatformSettingService $settings,
    ) {}

    /** Lu SANS utilisateur : le mandat est une politique de plateforme ; un drapeau segmenté vaut éteint. */
    public function enabled(): bool
    {
        return $this->flags->isEnabled(Flag::RadarMandate->value);
    }

    /** L'espace des mandats, s'il est désigné et ouvert aux écritures ; `null` sinon. */
    public function space(): ?Agency
    {
        $id = (int) $this->settings->getValue('radar.mandate_agency_id');
        if ($id <= 0) {
            return null;
        }
        $agency = Agency::query()->find($id);

        return $agency === null || $agency->status === AgencyStatus::Suspended || $agency->primary_admin_id === null ? null : $agency;
    }

    /** L'auteur des biens sous mandat : l'administrateur principal de l'espace. */
    public function author(Agency $space): User
    {
        return User::query()->findOrFail($space->primary_admin_id);
    }

    /**
     * Ce que l'écran lit : drapeau éteint, rien d'autre (le front ne propose rien). Allumé, ce qui empêcherait une
     * publication sous mandat pour cet annonceur — l'accord et les annonces se jugent avec celles de « publier pour lui ».
     *
     * @return array{enabled: bool, space: ?array{id: int, name: string}, blocking: list<string>}
     */
    public function preview(RadarAdvertiser $advertiser, bool $nothingCovered): array
    {
        if (! $this->enabled()) {
            return ['enabled' => false, 'space' => null, 'blocking' => []];
        }
        $space = $this->space();

        return [
            'enabled' => true,
            'space' => $space === null ? null : ['id' => (int) $space->id, 'name' => (string) $space->name],
            'blocking' => $this->blocking($advertiser, $space, $nothingCovered),
        ];
    }

    /**
     * Sous le verrou de l'annonceur : refuse (422) ce que {@see self::blocking()} nomme, hors accord et annonces.
     */
    public function assertAvailable(RadarAdvertiser $locked): Agency
    {
        abort_code_unless($this->enabled(), 422, self::DISABLED);
        $space = $this->space();
        abort_code_if($space === null, 422, self::SPACE_MISSING);
        abort_code_if($locked->do_not_contact_at !== null || $locked->phone === null, 422, 'radar.advertiser.do_not_contact');
        abort_code_if($locked->user_id !== null, 422, self::ACCOUNT_EXISTS);

        return $space;
    }

    /** @return list<string> */
    private function blocking(RadarAdvertiser $advertiser, ?Agency $space, bool $nothingCovered): array
    {
        $blocking = [];
        if ($space === null) {
            $blocking[] = self::SPACE_MISSING;
        }
        if ($advertiser->do_not_contact_at !== null || $advertiser->phone === null) {
            $blocking[] = 'radar.advertiser.do_not_contact';
        }
        // Deux états ne se mêlent pas (ADR-0079 § 4) : un compte rattaché se publie dans son espace, pas sous mandat.
        if ($advertiser->user_id !== null) {
            $blocking[] = self::ACCOUNT_EXISTS;
        }
        if ($nothingCovered) {
            $blocking[] = 'radar.publish.nothing_covered';
        }

        return $blocking;
    }
}
