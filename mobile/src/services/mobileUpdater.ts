import Constants from 'expo-constants';

const RELEASES_API = 'https://api.github.com/repos/m4rsu-code/faithstream/releases/latest';

export type MobileUpdate = {
  version: string;
  notes: string;
  apkName: string;
  downloadUrl: string;
  sha256?: string;
  size: number;
};

type GitHubRelease = {
  draft?: boolean;
  prerelease?: boolean;
  tag_name?: string;
  name?: string;
  body?: string | null;
  assets?: { name?: string; browser_download_url?: string; size?: number; digest?: string | null }[];
};

const versionParts = (version: string) => {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
};

const isNewer = (latest: string, current: string) => {
  const latestParts = versionParts(latest);
  const currentParts = versionParts(current);
  if (!latestParts || !currentParts) return false;
  for (let index = 0; index < 3; index += 1) {
    if (latestParts[index] !== currentParts[index]) return latestParts[index] > currentParts[index];
  }
  return false;
};

export const checkForMobileUpdate = async (): Promise<MobileUpdate | null> => {
  const response = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!response.ok) throw new Error(`Update check returned ${response.status}.`);
  const release = await response.json() as GitHubRelease;
  if (release.draft || release.prerelease || !release.tag_name) return null;

  const version = release.tag_name.replace(/^v/i, '');
  const currentVersion = Constants.expoConfig?.version ?? '0.0.0';
  if (!isNewer(version, currentVersion)) return null;

  const apk = release.assets?.find((asset) => asset.name?.toLowerCase().endsWith('.apk') && asset.browser_download_url);
  if (!apk?.browser_download_url || !apk.name) return null;
  return {
    version,
    notes: release.body?.trim() ?? '',
    apkName: apk.name,
    downloadUrl: apk.browser_download_url,
    sha256: apk.digest?.replace(/^sha256:/i, '').toLowerCase() || undefined,
    size: apk.size ?? 0,
  };
};
