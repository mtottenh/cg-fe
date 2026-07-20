/**
 * True only for parseable absolute http:/https: URLs. Use to guard
 * user-supplied links before binding them to `href`.
 */
export function isHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
