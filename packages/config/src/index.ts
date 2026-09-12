export const MATRIX_SERVER_NAME = "impro.chat";
export const APP_HOST = process.env.APP_HOST ?? "app.impro.chat";

export function publicUrls() {
  const scheme = process.env.SCHEME ?? "https";
  const domain = process.env.DOMAIN ?? "impro.chat";
  return {
    site: process.env.SITE_URL ?? `${scheme}://${domain}`,
    app: process.env.APP_URL ?? `${scheme}://app.${domain}`,
    api: process.env.API_URL ?? `${scheme}://api.${domain}`,
    matrix: process.env.MATRIX_PUBLIC_URL ?? `${scheme}://matrix.${domain}`,
    auth: process.env.AUTH_PUBLIC_URL ?? `${scheme}://auth.${domain}`,
  };
}
