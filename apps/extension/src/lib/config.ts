/** Build-time configuration (ENV-05). All values are public. */
export const config = __CAREEROS_CONFIG__;

export const isSupabaseConfigured = (): boolean =>
  config.supabaseUrl.length > 0 && config.supabasePublishableKey.length > 0;
