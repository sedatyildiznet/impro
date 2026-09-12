# Authentication

Impro uses **Matrix Authentication Service (MAS) 1.24** with Synapse's `matrix_authentication_service` block (not the deprecated `experimental_features.msc3861`).

Flow:

1. User opens **app.impro.chat** and creates an Impro account (username, display name, email, password).
2. Impro API calls the MAS Admin API (`/api/admin/v1/users`) using an OAuth2 `client_credentials` grant with scope `urn:mas:admin`.
3. MAS provisions `@username:impro.chat` on Synapse.
4. Login uses the MAS **compatibility layer** (`/_matrix/client/v3/login`), reverse-proxied from `matrix.impro.chat` to MAS.
5. Impro sets an HttpOnly session cookie. The Matrix access token is stored encrypted (`APP_ENCRYPTION_KEY`, AES-256-GCM) and also returned to the client for realtime.

Users never see “Matrix Authentication Service”. MAS `branding.service_name` is **Impro**.

Registration email is optional until SMTP is configured (`password_registration_email_required: false`).
