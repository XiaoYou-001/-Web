export function publicAsset(path) {
  const base = import.meta.env?.BASE_URL || '/'
  return `${base.replace(/\/?$/, '/')}${path.replace(/^\/+/, '')}`
}

export const LANDSCAPE_FALLBACK = publicAsset('images/placeholder-landscape.svg')
export const AVATAR_FALLBACK = publicAsset('default-avatar.svg')

export function resolveImageSource(source, fallback = LANDSCAPE_FALLBACK) {
  if (typeof source !== 'string' || !source.trim()) return fallback
  const value = source.trim()
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(value)) return value
  try {
    const url = new URL(value, 'https://local.invalid/')
    if (!['http:', 'https:'].includes(url.protocol)) return fallback
    if (url.hostname === 'example.com' || url.hostname.endsWith('.example.com')) return fallback
    if (/^\/(?:images\/|default-avatar\.svg)/.test(value)) return publicAsset(value)
    return value
  } catch { return fallback }
}
