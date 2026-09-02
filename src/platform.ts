// Supported host platforms for the local desktop bridge.
//
// The supported desktop targets are intentionally explicit so a
// different operating system does not look supported until it has been
// validated end to end.

export const SUPPORTED_DESKTOP_PLATFORMS = ['win32', 'linux'] as const;
export type SupportedDesktopPlatform = (typeof SUPPORTED_DESKTOP_PLATFORMS)[number];

export interface PlatformSupport {
  supported: boolean;
  platform: string;
  label: string;
  reason?: string;
}

export function platformSupport(platform: string = process.platform): PlatformSupport {
  if (platform === 'win32') {
    return { supported: true, platform, label: 'Windows Desktop' };
  }
  if (platform === 'linux') {
    return { supported: true, platform, label: 'Linux Desktop' };
  }
  return {
    supported: false,
    platform,
    label: platform,
    reason: 'Conduit Bridge currently supports Windows Desktop and Linux Desktop only.',
  };
}

export function assertSupportedPlatform(platform: string = process.platform): void {
  const support = platformSupport(platform);
  if (!support.supported) {
    throw new Error(`${support.reason} Detected platform: ${support.platform}.`);
  }
}
