/**
 * One-time license state shared by the desktop app.
 *
 * The API refuses account routes for an unlicensed account with HTTP 403 and
 * `{ license_required: true }`. Local features (Studio, presentations kept on this
 * computer, songbooks) keep working, so this must never sign the operator out.
 */
import { API_BASE_URL } from './apiConfig';

export const LICENSE_REQUIRED_EVENT = 'faithstream:license-required';

export const LICENSE_REQUIRED_MESSAGE =
  'A one-time FaithStream Studio license is required for this account. Activate it to sync your songs, slides and templates across devices.';

type WebsiteEnv = { VITE_FAITHSTREAM_WEBSITE_URL?: string };
const websiteEnv = (import.meta as ImportMeta & { env: WebsiteEnv }).env;

/**
 * The Plans page that explains the license and takes payment.
 *
 * Set VITE_FAITHSTREAM_WEBSITE_URL when the website does not share the API's origin.
 * Locally it falls back to the origin of the API address, e.g. http://127.0.0.1:8000/plans.
 */
const websiteBaseUrl = (() => {
  const configured = (websiteEnv.VITE_FAITHSTREAM_WEBSITE_URL ?? '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return '';
  }
})();

export const PLANS_URL = `${websiteBaseUrl}/plans`;

/** True when an API response body says this account has no active license. */
export const isLicenseRequiredPayload = (
  data: unknown,
): data is { license_required?: boolean; message?: string } => {
  if (!data || typeof data !== 'object') return false;
  const payload = data as { license_required?: unknown };
  return payload.license_required === true;
};

/** Tells the signed-in shell to show the activate-your-license screen. */
export const notifyLicenseRequired = (message?: string) => {
  window.dispatchEvent(
    new CustomEvent<{ message: string }>(LICENSE_REQUIRED_EVENT, {
      detail: { message: message?.trim() || LICENSE_REQUIRED_MESSAGE },
    }),
  );
};

/** Opens the Plans page in the operator's normal browser, never inside the app window. */
export const openPlansPage = async (): Promise<void> => {
  try {
    const opened = await window.faithstreamWindow?.openExternalUrl(PLANS_URL);
    if (opened) return;
  } catch {
    /* Fall through to the in-renderer attempt below. */
  }
  try {
    window.open(PLANS_URL, '_blank', 'noopener,noreferrer');
  } catch {
    /* The address is shown on screen so it can still be opened by hand. */
  }
};
