<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_licenses', function (Blueprint $table): void {
            $table->string('source', 20)->default('payment')->after('status');
            $table->foreignId('activated_by')->nullable()->after('activated_at')->constrained('users')->nullOnDelete();
            $table->string('activation_note', 500)->nullable()->after('activated_by');
            $table->timestamp('revoked_at')->nullable()->after('activation_note');
            $table->foreignId('revoked_by')->nullable()->after('revoked_at')->constrained('users')->nullOnDelete();
            $table->string('revocation_note', 500)->nullable()->after('revoked_by');
        });

        Schema::create('license_admin_actions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('user_email', 255);
            $table->foreignId('admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 40);
            $table->string('reason', 500)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['user_id', 'created_at']);
            $table->index(['action', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('license_admin_actions');

        Schema::table('user_licenses', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('activated_by');
            $table->dropConstrainedForeignId('revoked_by');
            $table->dropColumn(['source', 'activation_note', 'revoked_at', 'revocation_note']);
        });
    }
};
