export type FeatureFlags = {
  bridge_whatsapp: boolean;
  bridge_telegram: boolean;
  bridge_signal: boolean;
  bridge_instagram: boolean;
  bridge_discord: boolean;
  bridge_messenger: boolean;
  matrix_federation: boolean;
  workspace_features: boolean;
  ai: boolean;
  automations: boolean;
  analytics: boolean;
  experimental_features: boolean;
  mock_bridge: boolean;
};

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  matrixUserId: string;
  isGlobalAdmin: boolean;
};

export type PublicError = {
  code: string;
  message: string;
};
