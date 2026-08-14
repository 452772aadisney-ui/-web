export type DiscordEmbed = {
  title?: string
  description?: string
  url?: string
  color?: number
}

export type DiscordWebhookInput = {
  content?: string
  embeds?: DiscordEmbed[]
}

export async function sendDiscordWebhook(input: DiscordWebhookInput): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim()
  if (!webhookUrl) {
    console.warn('[discord] DISCORD_WEBHOOK_URL is not configured; notification skipped')
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      console.error('[discord] webhook failed:', await response.text())
    }
  } catch (error) {
    console.error('[discord] webhook error:', error)
  }
}
