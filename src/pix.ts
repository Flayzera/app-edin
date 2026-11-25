import type { PixProfile } from './types'

function tlv(id: string, value: string) {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`
}

function crc16(value: string) {
  let crc = 0xffff
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function normalizePixLabel(raw: string, max: number) {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)
}

export function normalizePixKey(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase()
    if (email.length > 77 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
    return email
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  const digits = trimmed.replace(/\D/g, '')
  const looksPhone = trimmed.includes('+') || trimmed.includes('(') || /\s/.test(trimmed)
  if (looksPhone) {
    let phone = digits
    if (!phone.startsWith('55')) {
      if (phone.length !== 10 && phone.length !== 11) return null
      phone = `55${phone}`
    }
    const formatted = `+${phone}`
    return /^\+55\d{10,11}$/.test(formatted) ? formatted : null
  }
  const compact = trimmed.replace(/[.\-/\s]/g, '')
  if ((digits.length === 11 || digits.length === 14) && compact === digits) return digits
  return null
}

export function isReadyPix(profile: unknown): profile is PixProfile {
  if (typeof profile !== 'object' || profile === null) return false
  const row = profile as PixProfile
  if (typeof row.key !== 'string' || typeof row.name !== 'string' || typeof row.city !== 'string') return false
  return (
    normalizePixKey(row.key) === row.key &&
    row.name.length > 0 &&
    normalizePixLabel(row.name, 25) === row.name &&
    row.city.length > 0 &&
    normalizePixLabel(row.city, 15) === row.city
  )
}

export function pixPayload(profile: PixProfile, amountCents: number) {
  const amount = (amountCents / 100).toFixed(2)
  const account = tlv('00', 'br.gov.bcb.pix') + tlv('01', profile.key)
  const body = [
    tlv('00', '01'),
    tlv('26', account),
    tlv('52', '0000'),
    tlv('53', '986'),
    tlv('54', amount),
    tlv('58', 'BR'),
    tlv('59', profile.name),
    tlv('60', profile.city),
    tlv('62', tlv('05', '***')),
  ].join('')
  const ready = `${body}6304`
  return ready + crc16(ready)
}
