<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('presentation_projects', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->uuid('project_id');
            $table->string('name', 120);
            $table->jsonb('slides');
            $table->boolean('has_local_media')->default(false);
            $table->unsignedBigInteger('project_updated_at');
            $table->timestamps();
            $table->unique(['user_id', 'project_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('presentation_projects');
    }
};
