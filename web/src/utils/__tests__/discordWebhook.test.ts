import { describe, it, expect } from 'vitest'
import { discordWebhookProblem } from '@/utils/discordWebhook'

describe('discordWebhookProblem', () => {
  it.each([
    'https://discord.com/api/webhooks/123/abc',
    'https://discordapp.com/api/webhooks/123/abc',
  ])('accepts %s', (url) => {
    expect(discordWebhookProblem(url)).toBeNull()
  })

  it.each([
    ['http://discord.com/api/webhooks/1/a', 'not https'],
    ['https://evil.example/api/webhooks/1/a', 'other host'],
    ['https://discord.com/channels/1/2', 'not a webhook path'],
    ['discord.com/api/webhooks/1/a', 'no scheme'],
  ])('rejects %s (%s)', (url) => {
    expect(discordWebhookProblem(url)).not.toBeNull()
  })

  it('rejects anything longer than 512 characters', () => {
    const url = `https://discord.com/api/webhooks/1/${'a'.repeat(520)}`
    expect(discordWebhookProblem(url)).toMatch(/512/)
  })
})
