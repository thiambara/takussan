<?php

namespace Database\Seeders\Crm;

use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Spatie\Permission\Exceptions\RoleDoesNotExist;
use Spatie\Permission\PermissionRegistrar;

class CustomerSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $registrar = app(PermissionRegistrar::class);

        foreach ($this->ctx->agencies as $agency) {
            $registrar->setPermissionsTeamId($agency->id);

            $agents = $this->ctx->usersWithProfile(AgentProfile::class, $agency->id);
            $addedByIds = $agents->isEmpty() ? [null] : $agents->pluck('id')->all();

            for ($i = 0; $i < $this->ctx->config->customersPerAgency; $i++) {
                $createdAt = Timeline::randomDateBetween(
                    Timeline::seedStart(),
                    Timeline::seedEnd()->subDays(1),
                );
                $firstName = $this->ctx->faker()->senegaleseFirstName();
                $lastName = $this->ctx->faker()->senegaleseLastName();
                $slug = Str::slug($firstName.' '.$lastName);
                $email = $slug.'-'.Str::random(4).'@'.$this->ctx->faker()->safeEmailDomain();

                $user = null;
                // 40% of customers also have a linked User account.
                if ($this->ctx->faker()->boolean(40)) {
                    $user = User::create([
                        'username' => $slug.'-'.Str::random(4),
                        'first_name' => $firstName,
                        'last_name' => $lastName,
                        'status' => UserStatus::Active,
                        'email' => $email,
                        'phone' => $this->ctx->faker()->senegalesePhoneNumber(),
                        'password' => Hash::make('password'),
                        'preferred_language' => 'fr',
                        'timezone' => 'Africa/Dakar',
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ]);
                    $user->forceFill(['email_verified_at' => $createdAt])->save();
                    try {
                        $user->syncRoles(['customer']);
                    } catch (RoleDoesNotExist) {
                        // Safe to skip if the role is not registered for this team.
                    }
                    // Deliberately NOT registering customer-linked users in the type
                    // buckets (via registerUser) so PropertySeeder's Owner pool stays
                    // limited to the dedicated agency owner accounts.
                }

                $pipelineStage = StatusDistribution::pick([
                    CustomerPipelineStage::Lead->value => 30,
                    CustomerPipelineStage::Prospect->value => 25,
                    CustomerPipelineStage::Qualified->value => 15,
                    CustomerPipelineStage::Negotiating->value => 10,
                    CustomerPipelineStage::Converted->value => 15,
                    CustomerPipelineStage::Lost->value => 5,
                ]);

                $customer = Customer::create([
                    'user_id' => $user?->id,
                    'agency_id' => $agency->id,
                    'added_by_id' => $addedByIds[array_rand($addedByIds)],
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'email' => $email,
                    'phone' => $this->ctx->faker()->senegalesePhoneNumber(),
                    'occupation' => $this->ctx->faker()->jobTitle(),
                    'status' => CustomerStatus::Active->value,
                    'pipeline_stage' => $pipelineStage,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt,
                ]);

                $this->ctx->registerCustomer($customer);
            }
        }
    }
}
