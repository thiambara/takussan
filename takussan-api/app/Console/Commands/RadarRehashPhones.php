<?php

namespace App\Console\Commands;

use App\Models\RadarAdvertiser;
use App\Support\RadarPhone;
use Illuminate\Console\Command;

/**
 * TCK-2414 (ADR-0077 §9) — après la pose ou la rotation de `RADAR_PHONE_HMAC_KEY` : réécrit sous la clé courante
 * l'empreinte de chaque annonceur dont le numéro est connu.
 *
 * Elle ne PEUT PAS réécrire celle d'un annonceur dont le numéro est purgé — c'est tout le cas d'un refus. Elle les compte :
 * tant qu'il y en a, l'ancienne clé reste dans `RADAR_PHONE_HMAC_PREVIOUS_KEYS` (ou `APP_PREVIOUS_KEYS` pour le repli sur
 * `app.key`), où les lectures la cherchent encore ({@see RadarPhone::hmacs()}). Sans cette commande, rien n'est perdu :
 * `RadarAdvertiserDirectory::findOrCreate()` réécrit une empreinte retrouvée sous une ancienne clé. Elle sert à ne laisser
 * aux anciennes clés que les empreintes qui en dépendent vraiment, et à le dire.
 *
 * Idempotente. Sont comptés en conflit, jamais réécrits, à fusionner à la main : une empreinte déjà prise par une autre
 * ligne, et une ligne sans refus qui masque le refus d'une autre ligne du même numéro sous une autre clé.
 */
class RadarRehashPhones extends Command
{
    protected $signature = 'radar:rehash-phones {--dry-run : compter sans rien écrire}';

    protected $description = 'Réécrit sous la clé courante l\'empreinte des numéros connus du Radar, et compte les empreintes de numéros purgés.';

    public function handle(): int
    {
        if (! RadarPhone::hasDedicatedKey()) {
            $this->warn('RADAR_PHONE_HMAC_KEY est vide : l\'empreinte dérive d\'APP_KEY (repli). À poser avant la production.');
        }

        $counts = ['rewritten' => 0, 'current' => 0, 'conflicts' => 0];
        RadarAdvertiser::query()->whereNotNull('phone')->select(['id', 'phone', 'phone_hmac', 'do_not_contact_at'])
            ->chunkById(500, function ($advertisers) use (&$counts): void {
                foreach ($advertisers as $advertiser) {
                    $hmac = RadarPhone::hmac((string) $advertiser->phone);
                    if ($this->shadowsRefusal($advertiser)) {
                        $counts['conflicts']++;
                    } elseif ($advertiser->phone_hmac === $hmac) {
                        $counts['current']++;
                    } elseif (RadarAdvertiser::query()->where('phone_hmac', $hmac)->whereKeyNot($advertiser->id)->exists()) {
                        $counts['conflicts']++;
                    } else {
                        $counts['rewritten']++;
                        if (! $this->option('dry-run')) {
                            $advertiser->forceFill(['phone_hmac' => $hmac])->save();
                        }
                    }
                }
            });

        $counts['without_number'] = RadarAdvertiser::query()->whereNull('phone')->count();
        $counts['refusals_without_number'] = RadarAdvertiser::query()->whereNull('phone')->whereNotNull('do_not_contact_at')->count();

        $this->info('radar:rehash-phones'.($this->option('dry-run') ? ' (à blanc)' : '').' — '
            .collect($counts)->map(fn (int $n, string $name) => "{$name}={$n}")->implode(' ').'.');
        if ($counts['without_number'] > 0) {
            $this->warn("{$counts['without_number']} empreinte(s) sans numéro ne se recalculent pas : une ancienne clé ne se retire jamais de RADAR_PHONE_HMAC_PREVIOUS_KEYS (ni d'APP_PREVIOUS_KEYS pour le repli sur APP_KEY).");
        }

        return self::SUCCESS;
    }

    /**
     * Une AUTRE ligne, refusée, porte une empreinte de ce numéro sous une autre clé : une ancienne clé oubliée pendant une
     * rotation a laissé naître cette ligne sans refus. Les lectures font gagner le refus ; la fusion se fait à la main.
     */
    private function shadowsRefusal(RadarAdvertiser $advertiser): bool
    {
        return $advertiser->do_not_contact_at === null && RadarAdvertiser::query()
            ->whereIn('phone_hmac', RadarPhone::hmacs((string) $advertiser->phone))
            ->whereKeyNot($advertiser->id)
            ->whereNotNull('do_not_contact_at')
            ->exists();
    }
}
