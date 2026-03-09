# Admin Settings Page - Planned Features

The `AdminSettingsPage.vue` is currently a stub. Implementation is deferred until the backend settings API endpoints are ready.

## Planned Sections

### Platform Configuration
- Site name, logo, favicon
- Default timezone
- Contact email

### Feature Flags
- Enable/disable registration
- Enable/disable specific games
- Maintenance mode toggle
- Beta feature toggles

### Rate Limiting
- API rate limit configuration
- Registration rate limits
- Match submission rate limits

### Email Templates
- Welcome email
- Password reset email
- Tournament notification templates
- Dispute resolution notification templates

### Integrations
- Discord webhook configuration
- Steam API key management
- Get5 server configuration

### Backup & Restore
- Database backup schedule
- Manual backup trigger
- Restore from backup

## Backend Requirements

None of these endpoints currently exist in the OpenAPI spec. The backend needs to expose:

- `GET /v1/admin/settings` - Get all settings
- `PATCH /v1/admin/settings` - Update settings
- `GET /v1/admin/settings/{category}` - Get settings by category
- `POST /v1/admin/maintenance` - Toggle maintenance mode
- `GET /v1/admin/feature-flags` - List feature flags
- `PATCH /v1/admin/feature-flags/{flag}` - Toggle a feature flag

## Status

Deferred to a future phase. The stub page in `src/pages/admin/AdminSettingsPage.vue` lists these as placeholder sections.
