<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AdminDashboardController;
use App\Http\Controllers\Api\AccountSongbookController;
use App\Http\Controllers\Api\LicensePaymentController;
use App\Http\Controllers\Api\PresentationProjectController;
use App\Http\Controllers\Api\PresentationTemplateController;
use App\Http\Middleware\EnsureAdminUser;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
Route::post('/login', [AuthController::class, 'login'])->middleware(['throttle:login', 'throttle:login-account']);
Route::get('/session/status', [AuthController::class, 'sessionStatus'])->middleware('throttle:30,1');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:3,1');
Route::post('/email/verification-notification', [AuthController::class, 'resendVerification'])->middleware('throttle:3,1');
Route::get('/profile-photos/{user}', [AuthController::class, 'showProfilePhoto'])
    ->middleware('signed:relative')
    ->name('profile-photos.show');
Route::get('/license/payment-options', [LicensePaymentController::class, 'options'])->middleware('throttle:60,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/website/account', [AuthController::class, 'websiteAccount']);
    Route::get('/license/payment-status', [LicensePaymentController::class, 'accountStatus']);
    Route::post('/license/payment-requests', [LicensePaymentController::class, 'submit'])->middleware('throttle:5,60');
    Route::middleware('license.active')->group(function () {
        Route::get('/user', [AuthController::class, 'user']);
        Route::patch('/user', [AuthController::class, 'updateUser']);
        Route::patch('/user/service-title', [AuthController::class, 'updateServiceTitle']);
        Route::post('/user/deletion-request', [AuthController::class, 'requestAccountDeletion']);
        Route::delete('/user/deletion-request', [AuthController::class, 'cancelAccountDeletionRequest']);
        Route::post('/user/profile-photo', [AuthController::class, 'storeProfilePhoto']);
        Route::delete('/user/profile-photo', [AuthController::class, 'deleteProfilePhoto']);
        Route::patch('/user/profile-photo/position', [AuthController::class, 'updateProfilePhotoPosition']);
        Route::get('/presentations', [PresentationProjectController::class, 'index']);
        Route::put('/presentations/{projectId}', [PresentationProjectController::class, 'store']);
        Route::delete('/presentations/{projectId}', [PresentationProjectController::class, 'destroy']);
        Route::get('/songbooks', [AccountSongbookController::class, 'index']);
        Route::put('/songbooks/{bookId}', [AccountSongbookController::class, 'store']);
        Route::delete('/songbooks/{bookId}', [AccountSongbookController::class, 'destroy']);
        Route::get('/templates', [PresentationTemplateController::class, 'index']);
        Route::put('/templates/{templateId}', [PresentationTemplateController::class, 'store']);
        Route::delete('/templates/{templateId}', [PresentationTemplateController::class, 'destroy']);

        Route::prefix('admin')->middleware([EnsureAdminUser::class, 'throttle:60,1'])->group(function () {
            Route::get('/overview', [AdminDashboardController::class, 'overview']);
            Route::get('/users', [AdminDashboardController::class, 'users']);
            Route::get('/deletion-requests/count', [AdminDashboardController::class, 'deletionRequestCount']);
            Route::get('/deletion-requests', [AdminDashboardController::class, 'deletionRequests']);
            Route::patch('/deletion-requests/{user}', [AdminDashboardController::class, 'decideDeletionRequest']);
            Route::get('/license-payments/count', [LicensePaymentController::class, 'count']);
            Route::get('/license-payments', [LicensePaymentController::class, 'adminIndex']);
            Route::get('/license-payments/{payment}/proof', [LicensePaymentController::class, 'proof']);
            Route::patch('/license-payments/{payment}', [LicensePaymentController::class, 'decide']);
        });
    });
});
