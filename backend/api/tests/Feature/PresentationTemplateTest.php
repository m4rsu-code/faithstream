<?php

namespace Tests\Feature;

use App\Models\PresentationTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PresentationTemplateTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Sunday service',
            'slides' => [['title' => 'Welcome', 'bg' => 'color:#0F1B2D>#1E3A5F', 'dim' => 0, 'box' => null]],
            'colors' => ['color:#0F1B2D>#1E3A5F', 'color:#F5B971'],
            'updatedAt' => 1000,
            'hasLocalMedia' => false,
        ], $overrides);
    }

    public function test_templates_require_sign_in(): void
    {
        $this->getJson('/api/templates')->assertUnauthorized();
    }

    public function test_a_template_is_saved_listed_and_deleted(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $id = '3f2b8f0e-7a52-4c1f-9d1e-2b7a4c9e8d10';

        $this->putJson("/api/templates/{$id}", $this->payload())
            ->assertOk()
            ->assertJsonPath('template.id', $id)
            ->assertJsonPath('template.colors.1', 'color:#F5B971');

        $this->getJson('/api/templates')
            ->assertOk()
            ->assertJsonCount(1, 'templates')
            ->assertJsonPath('templates.0.name', 'Sunday service')
            ->assertJsonPath('templates.0.slides.0.title', 'Welcome');

        $this->deleteJson("/api/templates/{$id}")->assertOk();
        $this->getJson('/api/templates')->assertJsonCount(0, 'templates');
    }

    public function test_an_older_copy_does_not_replace_a_newer_one(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->putJson('/api/templates/mine-abc123', $this->payload(['name' => 'New name', 'updatedAt' => 2000]))->assertOk();
        $this->putJson('/api/templates/mine-abc123', $this->payload(['name' => 'Old name', 'updatedAt' => 1000]))
            ->assertOk()
            ->assertJsonPath('template.name', 'New name');
    }

    public function test_users_only_see_their_own_templates(): void
    {
        $owner = User::factory()->create();
        PresentationTemplate::query()->create([
            'user_id' => $owner->id,
            'template_id' => 'owner-template',
            'name' => 'Private',
            'slides' => [['title' => 'One']],
            'template_updated_at' => 1,
        ]);

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/templates')->assertOk()->assertJsonCount(0, 'templates');
        $this->deleteJson('/api/templates/owner-template')->assertOk();
        $this->assertDatabaseHas('presentation_templates', ['template_id' => 'owner-template']);
    }

    public function test_invalid_template_ids_and_payloads_are_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->putJson('/api/templates/'.urlencode('bad id!'), $this->payload())->assertUnprocessable();
        $this->putJson('/api/templates/good-id', $this->payload(['slides' => []]))->assertUnprocessable();
        $this->putJson('/api/templates/good-id', $this->payload(['colors' => array_fill(0, 25, 'color:#000000')]))->assertUnprocessable();
    }

    public function test_presentations_keep_their_saved_colors(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $id = '9b1d0c6e-2f4a-4e8b-a1c3-5d7e9f0a1b2c';

        $this->putJson("/api/presentations/{$id}", [
            'name' => 'Easter',
            'slides' => [['title' => 'One']],
            'colors' => ['color:#112233'],
            'updatedAt' => 5,
        ])->assertOk()->assertJsonPath('presentation.colors.0', 'color:#112233');

        $this->getJson('/api/presentations')->assertJsonPath('presentations.0.colors.0', 'color:#112233');
    }
}
