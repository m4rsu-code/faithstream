<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_songbooks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('book_id', 100);
            $table->string('name', 160);
            $table->json('songs');
            $table->unsignedBigInteger('book_created_at');
            $table->unsignedBigInteger('book_updated_at')->index();
            $table->boolean('is_deleted')->default(false);
            $table->timestamps();
            $table->unique(['user_id', 'book_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_songbooks');
    }
};
