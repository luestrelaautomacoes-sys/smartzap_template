import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'

// Tier limits mapping
const TIER_LIMITS: Record<string, number> = {
  'TIER_250': 250,
  'TIER_1K': 1000,
  'TIER_2K': 2000,
  'TIER_10K': 10000,
  'TIER_100K': 100000,
  'TIER_UNLIMITED': Infinity,
}

// Shared logic to fetch limits from Meta API
async function fetchLimitsFromMeta(phoneNumberId: string, accessToken: string) {
  const authHeaders = { headers: { Authorization: `Bearer ${accessToken}` } }

  const [qualityResponse, tierResponse] = await Promise.allSettled([
    fetch(
      `https://graph.facebook.com/v24.0/${phoneNumberId}?fields=quality_score`,
      authHeaders
    ),
    fetch(
      `https://graph.facebook.com/v24.0/${phoneNumberId}?fields=whatsapp_business_manager_messaging_limit`,
      authHeaders
    ),
  ])

  let throughputLevel: 'HIGH' | 'STANDARD' = 'STANDARD'
  let qualityScore: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' = 'UNKNOWN'
  let messagingTier = 'TIER_250'

  if (qualityResponse.status === 'fulfilled' && qualityResponse.value.ok) {
    const qualityData = await qualityResponse.value.json()
    const rawQuality = qualityData.quality_score?.score?.toUpperCase()
    qualityScore = ['GREEN', 'YELLOW', 'RED'].includes(rawQuality)
      ? rawQuality
      : 'UNKNOWN'
  } else if (qualityResponse.status === 'fulfilled') {
    const errorText = await qualityResponse.value.text().catch(() => 'Unknown error')
    console.warn('⚠️ Could not fetch quality_score from Meta:', errorText)
  } else {
    console.warn('⚠️ Quality request failed:', qualityResponse.reason)
  }

  if (tierResponse.status === 'fulfilled' && tierResponse.value.ok) {
    const tierData = await tierResponse.value.json()
    const rawTier = tierData.whatsapp_business_manager_messaging_limit

    if (typeof rawTier === 'string') {
      messagingTier = rawTier
    } else if (rawTier && typeof rawTier === 'object') {
      messagingTier = rawTier.current_limit || rawTier.tier || rawTier.limit || 'TIER_250'
    }
  } else if (tierResponse.status === 'fulfilled') {
    const errorText = await tierResponse.value.text().catch(() => 'Unknown error')
    console.warn('⚠️ Could not fetch messaging tier from Meta:', errorText)
  } else {
    console.warn('⚠️ Messaging tier request failed:', tierResponse.reason)
  }

  const maxUniqueUsersPerDay = TIER_LIMITS[messagingTier] || 250

  return {
    messagingTier,
    maxUniqueUsersPerDay: maxUniqueUsersPerDay === Infinity ? -1 : maxUniqueUsersPerDay,
    throughputLevel,
    maxMessagesPerSecond: throughputLevel === 'HIGH' ? 1000 : 80,
    qualityScore,
    usedToday: 0,
    lastFetched: new Date().toISOString(),
  }
}

// GET /api/account/limits - Fetch limits using Redis credentials
export async function GET() {
  const credentials = await getWhatsAppCredentials()

  if (!credentials?.phoneNumberId || !credentials?.accessToken) {
    return NextResponse.json({
      error: 'NO_CREDENTIALS',
      message: 'Credenciais do WhatsApp não configuradas. Configure em Ajustes.'
    }, { status: 401 })
  }

  try {
    const limits = await fetchLimitsFromMeta(credentials.phoneNumberId, credentials.accessToken)
    return NextResponse.json(limits)
  } catch (error) {
    console.error('❌ Error fetching account limits:', error)
    return NextResponse.json({
      error: 'FETCH_FAILED',
      message: 'Não foi possível buscar os limites da sua conta na Meta.',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 502 })
  }
}

// POST /api/account/limits - Fetch limits (with optional body credentials, fallback to Redis)
export async function POST(request: NextRequest) {
  let phoneNumberId: string | undefined
  let accessToken: string | undefined

  try {
    const body = await request.json()
    if (body.phoneNumberId && body.accessToken && !body.accessToken.includes('***')) {
      phoneNumberId = body.phoneNumberId
      accessToken = body.accessToken
    }
  } catch {
      // No body provided, fallback to stored credentials
  }

  if (!phoneNumberId || !accessToken) {
    const credentials = await getWhatsAppCredentials()
    if (credentials) {
      phoneNumberId = credentials.phoneNumberId
      accessToken = credentials.accessToken
    }
  }

  if (!phoneNumberId || !accessToken) {
    return NextResponse.json({
      error: 'NO_CREDENTIALS',
      message: 'Credenciais do WhatsApp não configuradas. Configure em Ajustes.'
    }, { status: 401 })
  }

  try {
    const limits = await fetchLimitsFromMeta(phoneNumberId, accessToken)
    return NextResponse.json(limits)
  } catch (error) {
    console.error('❌ Error fetching account limits:', error)
    return NextResponse.json({
      error: 'API_ERROR',
      message: 'Erro ao conectar com a API da Meta. Tente novamente.',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
