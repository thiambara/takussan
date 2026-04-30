<?php

namespace Tests\Feature\Activity;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class ActivityLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_creating_user_records_an_activity_entry(): void
    {
        $user = User::factory()->create();

        $last = Activity::query()->latest('id')->first();
        $this->assertNotNull($last);
        $this->assertSame('created', $last->description);
        $this->assertSame($user->id, $last->subject_id);
        $this->assertSame(User::class, $last->subject_type);
    }

    public function test_updating_whitelisted_attribute_records_activity(): void
    {
        $user = User::factory()->create();
        $countBefore = Activity::query()->count();

        $user->update(['first_name' => 'Aminata-Updated']);

        $this->assertSame($countBefore + 1, Activity::query()->count());

        $last = Activity::query()->latest('id')->first();
        $this->assertSame('updated', $last->description);

        $changes = $last->attribute_changes->toArray();
        $this->assertArrayHasKey('first_name', $changes['attributes'] ?? []);
        $this->assertSame('Aminata-Updated', $changes['attributes']['first_name']);
    }

    public function test_password_change_is_not_logged(): void
    {
        $user = User::factory()->create();
        $countBefore = Activity::query()->count();

        $user->update(['password' => Hash::make('new-secret-password')]);

        $this->assertSame($countBefore, Activity::query()->count());
    }

    public function test_remember_token_change_is_not_logged(): void
    {
        $user = User::factory()->create();
        $countBefore = Activity::query()->count();

        $user->update(['remember_token' => Str::random(60)]);

        $this->assertSame($countBefore, Activity::query()->count());
    }

    public function test_activity_changes_never_contain_password_or_token_values(): void
    {
        $user = User::factory()->create();

        $user->update([
            'first_name' => 'Audit',
            'password' => Hash::make('another-secret'),
        ]);

        $last = Activity::query()->latest('id')->first();
        $changes = $last->attribute_changes->toArray();
        $attrs = $changes['attributes'] ?? [];
        $old = $changes['old'] ?? [];

        $this->assertArrayNotHasKey('password', $attrs);
        $this->assertArrayNotHasKey('password', $old);
        $this->assertArrayNotHasKey('remember_token', $attrs);
        $this->assertArrayNotHasKey('remember_token', $old);
        $this->assertArrayNotHasKey('two_factor_secret', $attrs);
    }

    public function test_soft_delete_records_a_deleted_activity(): void
    {
        $user = User::factory()->create();

        $user->delete();

        $last = Activity::query()->latest('id')->first();
        $this->assertSame('deleted', $last->description);
        $this->assertSame($user->id, $last->subject_id);
    }
}
