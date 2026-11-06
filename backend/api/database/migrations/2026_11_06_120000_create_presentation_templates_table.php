<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "My templates" in the desktop app's Presentations editor: a saved presentation design
 * (its slides and saved background colours) that the user can start new presentations from.
 * Pictures and videos stay on the computer they were imported on, like presentations.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('presentation_templates', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('template_id', 64);
            $table->string('name', 120);
            $table->jsonb('slides');
            $table->jsonb('colors')->nullable();
            $table->boolean('has_local_media')->default(false);
            $table->unsignedBigInteger('template_updated_at');
            $table->timestamps();
            $table->unique(['user_id', 'template_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('presentation_templates');
    }
};
