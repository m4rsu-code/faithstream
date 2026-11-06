<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ServiceTitleTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_account_has_no_service_title(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/user')->assertOk()->assertJsonPath('user.service_title', null);
    }

    public function test_the_service_title_is_saved_to_the_account(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/user/service-title', ['service_title' => '  Sunday Worship Service  '])
            ->assertOk()
            ->assertJsonPath('user.service_title', 'Sunday Worship Service');

        $this->getJson('/api/user')->assertJsonPath('user.service_title', 'Sunday Worship Service');
        $this->assertSame('Sunday Worship Service', $user->fresh()->service_title);
    }

    public function test_an_empty_title_clears_it(): void
    {
        Sanctum::actingAs(User::factory()->create(['service_title' => 'Old title']));

        $this->patchJson('/api/user/service-title', ['service_title' => ''])
            ->assertOk()
            ->assertJsonPath('user.service_title', null);
    }

    public function test_titles_are_limited_and_need_sign_in(): void
    {
        $this->patchJson('/api/user/service-title', ['service_title' => 'x'])->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create());
        $this->patchJson('/api/user/service-title', ['service_title' => str_repeat('a', 121)])->assertUnprocessable();
        $this->patchJson('/api/user/service-title', [])->assertUnprocessable();
    }
}
