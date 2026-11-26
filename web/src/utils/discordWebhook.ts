/**
 * Client-side check of a Discord webhook URL, mirroring the backend rule
 * (notification settings): https, discord.com or discordapp.com,
 * `/api/webhooks/…`, at most 512 characters. The backend validates again.
 */
const MAX_LENGTH = 512
const ALLOWED_HOSTS = new Set(['discord.com', 'discordapp.com'])

/** Null when the URL is acceptable, otherwise why it is not. */
export function discordWebhookProblem(raw: string): string | null {
  const text = raw.trim()
  if (text.length > MAX_LENGTH) return `The URL is longer than ${MAX_LENGTH} characters.`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return 'Not a valid URL.'
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || !url.pathname.startsWith('/api/webhooks/')) {
    return 'Use a Discord webhook URL: https://discord.com/api/webhooks/…'
  }
  return null
}
