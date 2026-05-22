import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials';
import { settingsDb } from '@/lib/supabase-db';

const META_API_VERSION = 'v21.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

interface RouteContext {
  params: Promise<{ phoneNumberId: string }>;
}

// Get verify token from Supabase settings (same source of truth as main webhook)
async function getVerifyToken(): Promise<string> {
  try {
    const storedToken = await settingsDb.get('webhook_verify_token');

    if (typeof storedToken === 'string' && storedToken.trim()) {
      return storedToken.trim();
    }

    const newToken = crypto.randomUUID();
    await settingsDb.set('webhook_verify_token', newToken);

    return newToken;
  } catch (error) {
    console.error('Failed to get verify token from Supabase settings:', error);
    return process.env.WEBHOOK_VERIFY_TOKEN || 'smartzap_verify_token';
  }
}

/**
 * POST /api/phone-numbers/[phoneNumberId]/webhook/override
 * Set webhook override URL for a specific phone number
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { phoneNumberId } = await context.params;

    let accessToken: string | undefined;
    let callbackUrl: string | undefined;

    try {
      const body = await request.json();

      if (
        body.accessToken &&
        typeof body.accessToken === 'string' &&
        body.accessToken.trim().length > 10
      ) {
        accessToken = body.accessToken.trim();
      }

      if (body.callbackUrl && typeof body.callbackUrl === 'string') {
        callbackUrl = body.callbackUrl.trim();
      }
    } catch {
      // Empty body, will use stored credentials
    }

    if (!accessToken) {
      const credentials = await getWhatsAppCredentials();
      if (credentials?.accessToken) {
        accessToken = credentials.accessToken;
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Access token não configurado' },
        { status: 401 }
      );
    }

    if (!callbackUrl) {
      return NextResponse.json(
        { error: 'callbackUrl é obrigatório' },
        { status: 400 }
      );
    }

    const verifyToken = await getVerifyToken();

    const response = await fetch(`${META_API_BASE}/${phoneNumberId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook_configuration: {
          override_callback_uri: callbackUrl,
          verify_token: verifyToken,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Meta API error setting webhook override:', data);
      return NextResponse.json(
        {
          error: data?.error?.message || 'Erro ao configurar webhook override',
          details: data?.error || data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook override configurado com sucesso',
      data,
    });
  } catch (error) {
    console.error('Error setting webhook override:', error);
    return NextResponse.json(
      { error: 'Erro interno ao configurar webhook' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/phone-numbers/[phoneNumberId]/webhook/override
 * Remove webhook override for a specific phone number
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { phoneNumberId } = await context.params;

    let accessToken: string | undefined;

    try {
      const body = await request.json();

      if (
        body.accessToken &&
        typeof body.accessToken === 'string' &&
        body.accessToken.trim().length > 10
      ) {
        accessToken = body.accessToken.trim();
      }
    } catch {
      // Empty body, will use stored credentials
    }

    if (!accessToken) {
      const credentials = await getWhatsAppCredentials();
      if (credentials?.accessToken) {
        accessToken = credentials.accessToken;
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Access token não configurado' },
        { status: 401 }
      );
    }

    const response = await fetch(`${META_API_BASE}/${phoneNumberId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook_configuration: {
          override_callback_uri: '',
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Meta API error removing webhook override:', data);
      return NextResponse.json(
        {
          error: data?.error?.message || 'Erro ao remover webhook override',
          details: data?.error || data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook override removido com sucesso',
      data,
    });
  } catch (error) {
    console.error('Error removing webhook override:', error);
    return NextResponse.json(
      { error: 'Erro interno ao remover webhook' },
      { status: 500 }
    );
  }
}