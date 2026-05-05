<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

return new class extends Migration
{
    public function up(): void
    {
        $dupes = DB::table('users')
            ->selectRaw('LOWER(email) as normalized, MIN(id) as keeper, GROUP_CONCAT(id) as all_ids')
            ->groupBy('normalized')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($dupes as $row) {
            $allIds = explode(',', (string) $row->all_ids);
            $losers = array_diff($allIds, [(string) $row->keeper]);
            Log::warning('email_dedup', [
                'normalized' => $row->normalized,
                'keeper' => $row->keeper,
                'removed' => array_values($losers),
            ]);
            DB::table('users')->whereIn('id', $losers)->delete();
        }

        DB::table('users')->update(['email' => DB::raw('LOWER(email)')]);
    }

    public function down(): void
    {
        // No-op: original casing is lost.
    }
};
