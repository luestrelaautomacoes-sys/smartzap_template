/**
 * Supabase Database Service
 * 
 * Drop-in replacement for turso-db.ts
 * Uses same interface for easy migration
 */

import { supabase } from './supabase'
import {
    Campaign,
    Contact,
    CampaignStatus,
    ContactStatus,
    Template,
    TemplateCategory,
    TemplateStatus,
    AppSettings,
    Bot,
    BotStatus,
    Flow,
    FlowNode,
    FlowEdge,
    FlowStatus,
    BotConversation,
    ConversationStatus,
    BotMessage,
    BotMessageDirection,
    BotMessageOrigin,
    BotMessageType,
    BotMessageStatus,
    ConversationVariable,
    AIAgent,
    AITool,
    ToolExecution,
    ToolExecutionStatus,
    FlowExecution,
    NodeExecution,
    TemplateProject,
    TemplateProjectItem,
    CreateTemplateProjectDTO,
} from '../types'

// Generate a simple ID (same as turso-db.ts for compatibility)
const generateId = () => Math.random().toString(36).substr(2, 9)

// ============================================================================
// CAMPAIGNS
// ============================================================================

export const campaignDb = {
    getAll: async (): Promise<Campaign[]> => {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            name: row.name,
            status: row.status as CampaignStatus,
            templateName: row.template_name,
            templateVariables: row.template_variables as string[] | undefined,
            recipients: row.total_recipients,
            sent: row.sent,
            delivered: row.delivered,
            read: row.read,
            failed: row.failed,
            createdAt: row.created_at,
            scheduledAt: row.scheduled_date,
            startedAt: row.started_at,
            completedAt: row.completed_at,
        }))
    },

    getById: async (id: string): Promise<Campaign | undefined> => {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            status: data.status as CampaignStatus,
            templateName: data.template_name,
            templateVariables: data.template_variables as string[] | undefined,
            recipients: data.total_recipients,
            sent: data.sent,
            delivered: data.delivered,
            read: data.read,
            failed: data.failed,
            createdAt: data.created_at,
            scheduledAt: data.scheduled_date,
            startedAt: data.started_at,
            completedAt: data.completed_at,
        }
    },

    create: async (campaign: {
        name: string
        templateName: string
        recipients: number
        scheduledAt?: string
        templateVariables?: string[]
    }): Promise<Campaign> => {
        const id = generateId()
        const now = new Date().toISOString()
        const status = campaign.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.SENDING

        const { data, error } = await supabase
            .from('campaigns')
            .insert({
                id,
                name: campaign.name,
                status,
                template_name: campaign.templateName,
                template_variables: campaign.templateVariables,
                total_recipients: campaign.recipients,
                sent: 0,
                delivered: 0,
                read: 0,
                failed: 0,
                created_at: now,
                scheduled_date: campaign.scheduledAt,
                started_at: campaign.scheduledAt ? null : now,
            })
            .select()
            .single()

        if (error) throw error

        return {
            id,
            name: campaign.name,
            status,
            templateName: campaign.templateName,
            templateVariables: campaign.templateVariables,
            recipients: campaign.recipients,
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
            createdAt: now,
            scheduledAt: campaign.scheduledAt,
            startedAt: campaign.scheduledAt ? undefined : now,
        }
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    duplicate: async (id: string): Promise<Campaign | undefined> => {
        const original = await campaignDb.getById(id)
        if (!original) return undefined

        const newId = generateId()
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('campaigns')
            .insert({
                id: newId,
                name: `${original.name} (Cópia)`,
                status: CampaignStatus.DRAFT,
                template_name: original.templateName,
                total_recipients: original.recipients,
                sent: 0,
                delivered: 0,
                read: 0,
                failed: 0,
                created_at: now,
            })

        if (error) throw error

        // Copy campaign contacts
        const { data: existingContacts } = await supabase
            .from('campaign_contacts')
            .select('contact_id, phone, name')
            .eq('campaign_id', id)

        if (existingContacts && existingContacts.length > 0) {
            const newContacts = existingContacts.map(c => ({
                id: generateId(),
                campaign_id: newId,
                contact_id: c.contact_id,
                phone: c.phone,
                name: c.name,
                status: 'pending',
            }))

            await supabase.from('campaign_contacts').insert(newContacts)
        }

        return campaignDb.getById(newId)
    },

    updateStatus: async (id: string, updates: Partial<Campaign>): Promise<Campaign | undefined> => {
        const updateData: Record<string, unknown> = {}

        if (updates.status !== undefined) updateData.status = updates.status
        if (updates.sent !== undefined) updateData.sent = updates.sent
        if (updates.delivered !== undefined) updateData.delivered = updates.delivered
        if (updates.read !== undefined) updateData.read = updates.read
        if (updates.failed !== undefined) updateData.failed = updates.failed
        if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt
        if (updates.startedAt !== undefined) updateData.started_at = updates.startedAt

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('campaigns')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return campaignDb.getById(id)
    },

    pause: async (id: string): Promise<Campaign | undefined> => {
        return campaignDb.updateStatus(id, { status: CampaignStatus.PAUSED })
    },

    resume: async (id: string): Promise<Campaign | undefined> => {
        return campaignDb.updateStatus(id, {
            status: CampaignStatus.SENDING,
            startedAt: new Date().toISOString()
        })
    },

    start: async (id: string): Promise<Campaign | undefined> => {
        return campaignDb.updateStatus(id, {
            status: CampaignStatus.SENDING,
            startedAt: new Date().toISOString()
        })
    },
}

// ============================================================================
// CONTACTS
// ============================================================================

export const contactDb = {
    getAll: async (): Promise<Contact[]> => {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            status: (row.status as ContactStatus) || ContactStatus.OPT_IN,
            tags: row.tags || [],
            lastActive: row.updated_at
                ? new Date(row.updated_at).toLocaleDateString()
                : (row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }))
    },

    getById: async (id: string): Promise<Contact | undefined> => {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return undefined

        return {
            id: data.id,
            name: data.name,
            phone: data.phone,
            status: (data.status as ContactStatus) || ContactStatus.OPT_IN,
            tags: data.tags || [],
            lastActive: data.updated_at
                ? new Date(data.updated_at).toLocaleDateString()
                : (data.created_at ? new Date(data.created_at).toLocaleDateString() : '-'),
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    add: async (contact: Omit<Contact, 'id' | 'lastActive'>): Promise<Contact> => {
        // Check if contact already exists by phone
        const { data: existing } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone', contact.phone)
            .single()

        const now = new Date().toISOString()

        if (existing) {
            // Update existing contact
            const updateData: any = {
                updated_at: now
            }

            if (contact.name) updateData.name = contact.name
            if (contact.status) updateData.status = contact.status
            if (contact.tags) updateData.tags = contact.tags

            const { error: updateError } = await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', existing.id)

            if (updateError) throw updateError

            return {
                id: existing.id,
                name: contact.name || existing.name,
                phone: existing.phone,
                status: (contact.status || existing.status) as ContactStatus,
                tags: contact.tags || existing.tags || [],
                lastActive: 'Agora mesmo',
                createdAt: existing.created_at,
                updatedAt: now,
            }
        }

        // Create new contact
        const id = generateId()

        const { error } = await supabase
            .from('contacts')
            .insert({
                id,
                name: contact.name || '',
                phone: contact.phone,
                status: contact.status || ContactStatus.OPT_IN,
                tags: contact.tags || [],
                created_at: now,
            })

        if (error) throw error

        return {
            ...contact,
            id,
            lastActive: 'Agora mesmo',
            createdAt: now,
            updatedAt: now,
        }
    },

    update: async (id: string, data: Partial<Contact>): Promise<Contact | undefined> => {
        const updateData: Record<string, unknown> = {}

        if (data.name !== undefined) updateData.name = data.name
        if (data.phone !== undefined) updateData.phone = data.phone
        if (data.status !== undefined) updateData.status = data.status
        if (data.tags !== undefined) updateData.tags = data.tags

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return contactDb.getById(id)
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    deleteMany: async (ids: string[]): Promise<number> => {
        if (ids.length === 0) return 0

        const { error } = await supabase
            .from('contacts')
            .delete()
            .in('id', ids)

        if (error) throw error

        return ids.length
    },

    import: async (contacts: Omit<Contact, 'id' | 'lastActive'>[]): Promise<number> => {
        if (contacts.length === 0) return 0

        const now = new Date().toISOString()
        const rows = contacts.map(contact => ({
            id: generateId(),
            name: contact.name || '',
            phone: contact.phone,
            status: contact.status || ContactStatus.OPT_IN,
            tags: contact.tags || [],
            created_at: now,
        }))

        // Use upsert to handle duplicates (phone is unique)
        const { error } = await supabase
            .from('contacts')
            .upsert(rows, { onConflict: 'phone', ignoreDuplicates: true })

        if (error) throw error

        return rows.length
    },

    getTags: async (): Promise<string[]> => {
        const { data, error } = await supabase
            .from('contacts')
            .select('tags')
            .not('tags', 'is', null)

        if (error) throw error

        const tagSet = new Set<string>()
            ; (data || []).forEach(row => {
                if (Array.isArray(row.tags)) {
                    row.tags.forEach((tag: string) => tagSet.add(tag))
                }
            })

        return Array.from(tagSet).sort()
    },

    getStats: async () => {
        const { data, error } = await supabase
            .from('contacts')
            .select('status')

        if (error) throw error

        const stats = {
            total: data?.length || 0,
            optIn: 0,
            optOut: 0,
        }

            ; (data || []).forEach(row => {
                if (row.status === 'Opt-in') stats.optIn++
                else if (row.status === 'Opt-out') stats.optOut++
            })

        return stats
    },
}

// ============================================================================
// CAMPAIGN CONTACTS (Junction Table)
// ============================================================================

export const campaignContactDb = {
    addContacts: async (campaignId: string, contacts: { contactId: string, phone: string, name: string }[]): Promise<void> => {
        const rows = contacts.map(contact => ({
            id: generateId(),
            campaign_id: campaignId,
            contact_id: contact.contactId,
            phone: contact.phone,
            name: contact.name,
            status: 'pending',
        }))

        const { error } = await supabase
            .from('campaign_contacts')
            .insert(rows)

        if (error) throw error
    },

    getContacts: async (campaignId: string) => {
        const { data, error } = await supabase
            .from('campaign_contacts')
            .select('*')
            .eq('campaign_id', campaignId)
            .order('sent_at', { ascending: false })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            campaignId: row.campaign_id,
            contactId: row.contact_id,
            phone: row.phone,
            name: row.name,
            status: row.status,
            messageId: row.message_id,
            sentAt: row.sent_at,
            deliveredAt: row.delivered_at,
            readAt: row.read_at,
            error: row.error,
        }))
    },

    updateStatus: async (campaignId: string, phone: string, status: string, messageId?: string, error?: string): Promise<void> => {
        const now = new Date().toISOString()
        const updateData: Record<string, unknown> = { status }

        if (messageId) updateData.message_id = messageId
        if (error) updateData.error = error
        if (status === 'sent') updateData.sent_at = now
        if (status === 'delivered') updateData.delivered_at = now
        if (status === 'read') updateData.read_at = now

        const { error: dbError } = await supabase
            .from('campaign_contacts')
            .update(updateData)
            .eq('campaign_id', campaignId)
            .eq('phone', phone)

        if (dbError) throw dbError
    },
}

// ============================================================================
// TEMPLATES
// ============================================================================

export const templateDb = {
    getAll: async (): Promise<Template[]> => {
        const { data, error } = await supabase
            .from('templates')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            name: row.name,
            category: (row.category as TemplateCategory) || 'MARKETING',
            language: row.language,
            status: (row.status as TemplateStatus) || 'PENDING',
            content: row.components,
            preview: '',
            lastUpdated: row.updated_at || row.created_at,
        }))
    },

    upsert: async (template: Template): Promise<void> => {
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('templates')
            .upsert({
                id: template.id,
                name: template.name,
                category: template.category,
                language: template.language,
                status: template.status,
                components: typeof template.content === 'string'
                    ? JSON.parse(template.content)
                    : template.content,
                created_at: now,
                updated_at: now,
            }, { onConflict: 'name' })

        if (error) throw error
    },
}

// ============================================================================
// SETTINGS
// ============================================================================

export const settingsDb = {
    get: async (key: string): Promise<string | null> => {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', key)
            .single()

        if (error || !data) return null
        return data.value
    },

    set: async (key: string, value: string): Promise<void> => {
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('settings')
            .upsert({
                key,
                value,
                updated_at: now,
            }, { onConflict: 'key' })

        if (error) throw error
    },

    getAll: async (): Promise<AppSettings> => {
        const { data, error } = await supabase
            .from('settings')
            .select('key, value')

        if (error) throw error

        const settings: Record<string, string> = {}
            ; (data || []).forEach(row => {
                settings[row.key] = row.value
            })

        return {
            phoneNumberId: settings.phoneNumberId || '',
            businessAccountId: settings.businessAccountId || '',
            accessToken: settings.accessToken || '',
            isConnected: settings.isConnected === 'true',
        }
    },

    saveAll: async (settings: AppSettings): Promise<void> => {
        await settingsDb.set('phoneNumberId', settings.phoneNumberId)
        await settingsDb.set('businessAccountId', settings.businessAccountId)
        await settingsDb.set('accessToken', settings.accessToken)
        await settingsDb.set('isConnected', settings.isConnected ? 'true' : 'false')
    },
}

// ============================================================================
// DASHBOARD
// ============================================================================

export const dashboardDb = {
    getStats: async () => {
        // Get campaign stats with aggregation
        const { data, error } = await supabase
            .from('campaigns')
            .select('sent, delivered, read, failed, status, name, total_recipients')

        if (error) throw error

        let totalSent = 0
        let totalDelivered = 0
        let totalFailed = 0
        let activeCampaigns = 0

            ; (data || []).forEach(row => {
                totalSent += row.sent || 0
                totalDelivered += row.delivered || 0
                totalFailed += row.failed || 0
                if (row.status === 'Enviando' || row.status === 'Agendada') {
                    activeCampaigns++
                }
            })

        const deliveryRate = totalSent > 0
            ? ((totalDelivered / totalSent) * 100).toFixed(1)
            : '100'

        // Get recent campaigns for chart
        const chartData = (data || [])
            .slice(0, 7)
            .map(r => ({
                name: (r.name as string).substring(0, 3),
                sent: r.total_recipients as number,
                read: r.read as number,
            }))
            .reverse()

        return {
            sent24h: totalSent.toLocaleString(),
            deliveryRate: `${deliveryRate}%`,
            activeCampaigns: activeCampaigns.toString(),
            failedMessages: totalFailed.toString(),
            chartData,
        }
    },
}

// ============================================================================
// BOTS
// ============================================================================

export const botDb = {
    getAll: async (): Promise<Bot[]> => {
        const { data, error } = await supabase
            .from('bots')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            name: row.name,
            phoneNumberId: row.phone_number_id,
            flowId: row.flow_id,
            status: row.status as BotStatus,
            welcomeMessage: row.welcome_message,
            fallbackMessage: row.fallback_message,
            sessionTimeoutMinutes: row.session_timeout_minutes || 30,
            triggerKeywords: row.trigger_keywords,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }))
    },

    getById: async (id: string): Promise<Bot | null> => {
        const { data, error } = await supabase
            .from('bots')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return null

        return {
            id: data.id,
            name: data.name,
            phoneNumberId: data.phone_number_id,
            flowId: data.flow_id,
            status: data.status as BotStatus,
            welcomeMessage: data.welcome_message,
            fallbackMessage: data.fallback_message,
            sessionTimeoutMinutes: data.session_timeout_minutes || 30,
            triggerKeywords: data.trigger_keywords,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    getByPhoneNumberId: async (phoneNumberId: string): Promise<Bot | null> => {
        const { data, error } = await supabase
            .from('bots')
            .select('*')
            .eq('phone_number_id', phoneNumberId)
            .eq('status', 'active')
            .single()

        if (error || !data) return null

        return {
            id: data.id,
            name: data.name,
            phoneNumberId: data.phone_number_id,
            flowId: data.flow_id,
            status: data.status as BotStatus,
            welcomeMessage: data.welcome_message,
            fallbackMessage: data.fallback_message,
            sessionTimeoutMinutes: data.session_timeout_minutes || 30,
            triggerKeywords: data.trigger_keywords,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    create: async (data: {
        name: string
        phoneNumberId: string
        welcomeMessage?: string
        fallbackMessage?: string
        sessionTimeoutMinutes?: number
        triggerKeywords?: string[]
    }): Promise<Bot> => {
        const id = generateId()
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('bots')
            .insert({
                id,
                name: data.name,
                phone_number_id: data.phoneNumberId,
                status: 'draft',
                welcome_message: data.welcomeMessage,
                fallback_message: data.fallbackMessage,
                session_timeout_minutes: data.sessionTimeoutMinutes || 30,
                trigger_keywords: data.triggerKeywords,
                created_at: now,
                updated_at: now,
            })

        if (error) throw error

        return {
            id,
            name: data.name,
            phoneNumberId: data.phoneNumberId,
            status: 'draft',
            welcomeMessage: data.welcomeMessage,
            fallbackMessage: data.fallbackMessage,
            sessionTimeoutMinutes: data.sessionTimeoutMinutes || 30,
            triggerKeywords: data.triggerKeywords,
            createdAt: now,
            updatedAt: now,
        }
    },

    update: async (id: string, data: Partial<Omit<Bot, 'id' | 'createdAt'>>): Promise<Bot | null> => {
        const updateData: Record<string, unknown> = {}

        if (data.name !== undefined) updateData.name = data.name
        if (data.phoneNumberId !== undefined) updateData.phone_number_id = data.phoneNumberId
        if (data.flowId !== undefined) updateData.flow_id = data.flowId
        if (data.status !== undefined) updateData.status = data.status
        if (data.welcomeMessage !== undefined) updateData.welcome_message = data.welcomeMessage
        if (data.fallbackMessage !== undefined) updateData.fallback_message = data.fallbackMessage
        if (data.sessionTimeoutMinutes !== undefined) updateData.session_timeout_minutes = data.sessionTimeoutMinutes
        if (data.triggerKeywords !== undefined) updateData.trigger_keywords = data.triggerKeywords

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('bots')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return botDb.getById(id)
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('bots')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    activate: async (id: string): Promise<Bot | null> => {
        return botDb.update(id, { status: 'active' })
    },

    deactivate: async (id: string): Promise<Bot | null> => {
        return botDb.update(id, { status: 'inactive' })
    },
}

// ============================================================================
// FLOWS
// ============================================================================

export const flowDb = {
    getAll: async (botId?: string): Promise<Flow[]> => {
        let query = supabase
            .from('flows')
            .select('*')
            .order('created_at', { ascending: false })

        if (botId) {
            query = query.eq('bot_id', botId)
        }

        const { data, error } = await query

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            botId: row.bot_id,
            name: row.name,
            nodes: row.nodes as FlowNode[],
            edges: row.edges as FlowEdge[],
            version: row.version,
            status: row.status as FlowStatus,
            isMainFlow: row.is_main_flow,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }))
    },

    getById: async (id: string): Promise<Flow | null> => {
        const { data, error } = await supabase
            .from('flows')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return null

        return {
            id: data.id,
            botId: data.bot_id,
            name: data.name,
            nodes: data.nodes as FlowNode[],
            edges: data.edges as FlowEdge[],
            version: data.version,
            status: data.status as FlowStatus,
            isMainFlow: data.is_main_flow,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    getMainFlow: async (botId: string): Promise<Flow | null> => {
        const { data, error } = await supabase
            .from('flows')
            .select('*')
            .eq('bot_id', botId)
            .eq('status', 'published')
            .order('is_main_flow', { ascending: false })
            .order('version', { ascending: false })
            .limit(1)
            .single()

        if (error || !data) return null

        return {
            id: data.id,
            botId: data.bot_id,
            name: data.name,
            nodes: data.nodes as FlowNode[],
            edges: data.edges as FlowEdge[],
            version: data.version,
            status: data.status as FlowStatus,
            isMainFlow: data.is_main_flow,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    create: async (data: {
        botId: string
        name: string
        nodes?: FlowNode[]
        edges?: FlowEdge[]
        isMainFlow?: boolean
    }): Promise<Flow> => {
        const id = generateId()
        const now = new Date().toISOString()
        const nodes = data.nodes || []
        const edges = data.edges || []

        const { error } = await supabase
            .from('flows')
            .insert({
                id,
                bot_id: data.botId,
                name: data.name,
                nodes,
                edges,
                version: 1,
                status: 'draft',
                is_main_flow: data.isMainFlow || false,
                created_at: now,
                updated_at: now,
            })

        if (error) throw error

        return {
            id,
            botId: data.botId,
            name: data.name,
            nodes,
            edges,
            version: 1,
            status: 'draft',
            isMainFlow: data.isMainFlow,
            createdAt: now,
            updatedAt: now,
        }
    },

    update: async (id: string, data: {
        name?: string
        nodes?: FlowNode[]
        edges?: FlowEdge[]
        isMainFlow?: boolean
    }): Promise<Flow | null> => {
        const updateData: Record<string, unknown> = {}

        if (data.name !== undefined) updateData.name = data.name
        if (data.nodes !== undefined) updateData.nodes = data.nodes
        if (data.edges !== undefined) updateData.edges = data.edges
        if (data.isMainFlow !== undefined) updateData.is_main_flow = data.isMainFlow

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('flows')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return flowDb.getById(id)
    },

    publish: async (id: string): Promise<Flow | null> => {
        const flow = await flowDb.getById(id)
        if (!flow) return null

        const now = new Date().toISOString()

        const { error: flowError } = await supabase
            .from('flows')
            .update({
                status: 'published',
                version: flow.version + 1,
                updated_at: now,
            })
            .eq('id', id)

        if (flowError) throw flowError

        // Update bot's flow_id reference
        const { error: botError } = await supabase
            .from('bots')
            .update({
                flow_id: id,
                updated_at: now,
            })
            .eq('id', flow.botId)

        if (botError) throw botError

        return flowDb.getById(id)
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('flows')
            .delete()
            .eq('id', id)

        if (error) throw error
    },

    duplicate: async (id: string): Promise<Flow | null> => {
        const original = await flowDb.getById(id)
        if (!original) return null

        return flowDb.create({
            botId: original.botId,
            name: `${original.name} (cópia)`,
            nodes: original.nodes,
            edges: original.edges,
            isMainFlow: false,
        })
    },
}

// ============================================================================
// BOT CONVERSATIONS 
// ============================================================================

export const botConversationDb = {
    getAll: async (options?: {
        botId?: string
        status?: ConversationStatus
        operatorId?: string
        limit?: number
    }): Promise<BotConversation[]> => {
        let query = supabase
            .from('bot_conversations')
            .select(`
        *,
        bots!inner(name)
      `)
            .order('last_message_at', { ascending: false })
            .limit(options?.limit || 50)

        if (options?.botId) query = query.eq('bot_id', options.botId)
        if (options?.status) query = query.eq('status', options.status)
        if (options?.operatorId) query = query.eq('assigned_operator_id', options.operatorId)

        const { data, error } = await query

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            botId: row.bot_id,
            botName: row.bots?.name,
            contactPhone: row.contact_phone,
            contactName: row.contact_name,
            currentNodeId: row.current_node_id,
            status: row.status as ConversationStatus,
            assignedOperatorId: row.assigned_operator_id,
            cswStartedAt: row.csw_started_at,
            lastMessageAt: row.last_message_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }))
    },

    getById: async (id: string): Promise<BotConversation | null> => {
        const { data, error } = await supabase
            .from('bot_conversations')
            .select(`
        *,
        bots!inner(name)
      `)
            .eq('id', id)
            .single()

        if (error || !data) return null

        return {
            id: data.id,
            botId: data.bot_id,
            botName: data.bots?.name,
            contactPhone: data.contact_phone,
            contactName: data.contact_name,
            currentNodeId: data.current_node_id,
            status: data.status as ConversationStatus,
            assignedOperatorId: data.assigned_operator_id,
            cswStartedAt: data.csw_started_at,
            lastMessageAt: data.last_message_at,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    getByContact: async (botId: string, contactPhone: string): Promise<BotConversation | null> => {
        const { data, error } = await supabase
            .from('bot_conversations')
            .select(`
        *,
        bots!inner(name)
      `)
            .eq('bot_id', botId)
            .eq('contact_phone', contactPhone)
            .neq('status', 'ended')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        if (error || !data) return null

        return {
            id: data.id,
            botId: data.bot_id,
            botName: data.bots?.name,
            contactPhone: data.contact_phone,
            contactName: data.contact_name,
            currentNodeId: data.current_node_id,
            status: data.status as ConversationStatus,
            assignedOperatorId: data.assigned_operator_id,
            cswStartedAt: data.csw_started_at,
            lastMessageAt: data.last_message_at,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    create: async (data: {
        botId: string
        contactPhone: string
        contactName?: string
    }): Promise<BotConversation> => {
        const id = generateId()
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('bot_conversations')
            .insert({
                id,
                bot_id: data.botId,
                contact_phone: data.contactPhone,
                contact_name: data.contactName,
                status: 'active',
                csw_started_at: now,
                last_message_at: now,
                created_at: now,
                updated_at: now,
            })

        if (error) throw error

        return {
            id,
            botId: data.botId,
            contactPhone: data.contactPhone,
            contactName: data.contactName,
            status: 'active',
            cswStartedAt: now,
            lastMessageAt: now,
            createdAt: now,
            updatedAt: now,
        }
    },

    update: async (id: string, data: Partial<{
        currentNodeId: string | null
        status: ConversationStatus
        assignedOperatorId: string | null
        contactName: string
        lastMessageAt: string
    }>): Promise<BotConversation | null> => {
        const updateData: Record<string, unknown> = {}

        if (data.currentNodeId !== undefined) updateData.current_node_id = data.currentNodeId
        if (data.status !== undefined) updateData.status = data.status
        if (data.assignedOperatorId !== undefined) updateData.assigned_operator_id = data.assignedOperatorId
        if (data.contactName !== undefined) updateData.contact_name = data.contactName
        if (data.lastMessageAt !== undefined) updateData.last_message_at = data.lastMessageAt

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('bot_conversations')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return botConversationDb.getById(id)
    },

    takeover: async (id: string, operatorId: string): Promise<BotConversation | null> => {
        return botConversationDb.update(id, {
            status: 'paused',
            assignedOperatorId: operatorId,
        })
    },

    release: async (id: string): Promise<BotConversation | null> => {
        return botConversationDb.update(id, {
            status: 'active',
            assignedOperatorId: null,
        })
    },

    end: async (id: string): Promise<BotConversation | null> => {
        return botConversationDb.update(id, {
            status: 'ended',
            assignedOperatorId: null,
        })
    },
}

// ============================================================================
// BOT MESSAGES
// ============================================================================

export const botMessageDb = {
    getByConversation: async (conversationId: string, limit = 100): Promise<BotMessage[]> => {
        const { data, error } = await supabase
            .from('bot_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(limit)

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            conversationId: row.conversation_id,
            waMessageId: row.wa_message_id,
            direction: row.direction as BotMessageDirection,
            origin: row.origin as BotMessageOrigin,
            type: row.type as BotMessageType,
            content: row.content,
            status: row.status as BotMessageStatus,
            error: row.error,
            createdAt: row.created_at,
            deliveredAt: row.delivered_at,
            readAt: row.read_at,
        }))
    },

    getByWaMessageId: async (waMessageId: string): Promise<BotMessage | null> => {
        const { data, error } = await supabase
            .from('bot_messages')
            .select('*')
            .eq('wa_message_id', waMessageId)
            .single()

        if (error || !data) return null

        return {
            id: data.id,
            conversationId: data.conversation_id,
            waMessageId: data.wa_message_id,
            direction: data.direction as BotMessageDirection,
            origin: data.origin as BotMessageOrigin,
            type: data.type as BotMessageType,
            content: data.content,
            status: data.status as BotMessageStatus,
            error: data.error,
            createdAt: data.created_at,
            deliveredAt: data.delivered_at,
            readAt: data.read_at,
        }
    },

    create: async (data: {
        conversationId: string
        waMessageId?: string
        direction: BotMessageDirection
        origin: BotMessageOrigin
        type: BotMessageType
        content: Record<string, unknown>
        status?: BotMessageStatus
    }): Promise<BotMessage> => {
        const id = generateId()
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('bot_messages')
            .insert({
                id,
                conversation_id: data.conversationId,
                wa_message_id: data.waMessageId,
                direction: data.direction,
                origin: data.origin,
                type: data.type,
                content: data.content,
                status: data.status || 'pending',
                created_at: now,
            })

        if (error) throw error

        // Update conversation last_message_at
        await supabase
            .from('bot_conversations')
            .update({
                last_message_at: now,
                updated_at: now,
            })
            .eq('id', data.conversationId)

        return {
            id,
            conversationId: data.conversationId,
            waMessageId: data.waMessageId,
            direction: data.direction,
            origin: data.origin,
            type: data.type,
            content: data.content,
            status: data.status || 'pending',
            createdAt: now,
        }
    },

    updateStatus: async (waMessageId: string, status: BotMessageStatus, error?: string): Promise<void> => {
        const now = new Date().toISOString()
        const updateData: Record<string, unknown> = { status }

        if (status === 'delivered') updateData.delivered_at = now
        if (status === 'read') updateData.read_at = now
        if (error) updateData.error = error

        const { error: dbError } = await supabase
            .from('bot_messages')
            .update(updateData)
            .eq('wa_message_id', waMessageId)

        if (dbError) throw dbError
    },
}

// ============================================================================
// CONVERSATION VARIABLES
// ============================================================================

export const conversationVariableDb = {
    getByConversation: async (conversationId: string): Promise<ConversationVariable[]> => {
        const { data, error } = await supabase
            .from('conversation_variables')
            .select('key, value, collected_at')
            .eq('conversation_id', conversationId)

        if (error) throw error

        return (data || []).map(row => ({
            key: row.key,
            value: row.value,
            collectedAt: row.collected_at,
        }))
    },

    getAsMap: async (conversationId: string): Promise<Record<string, string>> => {
        const vars = await conversationVariableDb.getByConversation(conversationId)
        return vars.reduce((acc, v) => ({ ...acc, [v.key]: v.value }), {})
    },

    set: async (conversationId: string, key: string, value: string): Promise<void> => {
        const now = new Date().toISOString()
        const id = generateId()

        const { error } = await supabase
            .from('conversation_variables')
            .upsert({
                id,
                conversation_id: conversationId,
                key,
                value,
                collected_at: now,
            }, { onConflict: 'conversation_id,key' })

        if (error) throw error
    },

    delete: async (conversationId: string, key: string): Promise<void> => {
        const { error } = await supabase
            .from('conversation_variables')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('key', key)

        if (error) throw error
    },
}

// ============================================================================
// AI AGENTS
// ============================================================================

export const aiAgentDb = {
    getAll: async (): Promise<AIAgent[]> => {
        const { data, error } = await supabase
            .from('ai_agents')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            name: row.name,
            systemPrompt: row.system_prompt,
            model: row.model as AIAgent['model'],
            maxTokens: row.max_tokens,
            temperature: Number(row.temperature),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }))
    },

    getById: async (id: string): Promise<AIAgent | null> => {
        const { data, error } = await supabase
            .from('ai_agents')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return null

        return {
            id: data.id,
            name: data.name,
            systemPrompt: data.system_prompt,
            model: data.model as AIAgent['model'],
            maxTokens: data.max_tokens,
            temperature: Number(data.temperature),
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        }
    },

    create: async (data: {
        name: string
        systemPrompt: string
        model?: AIAgent['model']
        maxTokens?: number
        temperature?: number
    }): Promise<AIAgent> => {
        const id = generateId()
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('ai_agents')
            .insert({
                id,
                name: data.name,
                system_prompt: data.systemPrompt,
                model: data.model || 'gemini-1.5-flash',
                max_tokens: data.maxTokens || 500,
                temperature: data.temperature || 0.7,
                created_at: now,
                updated_at: now,
            })

        if (error) throw error

        return {
            id,
            name: data.name,
            systemPrompt: data.systemPrompt,
            model: data.model || 'gemini-1.5-flash',
            maxTokens: data.maxTokens || 500,
            temperature: data.temperature || 0.7,
            createdAt: now,
            updatedAt: now,
        }
    },

    update: async (id: string, data: Partial<Omit<AIAgent, 'id' | 'createdAt'>>): Promise<AIAgent | null> => {
        const updateData: Record<string, unknown> = {}

        if (data.name !== undefined) updateData.name = data.name
        if (data.systemPrompt !== undefined) updateData.system_prompt = data.systemPrompt
        if (data.model !== undefined) updateData.model = data.model
        if (data.maxTokens !== undefined) updateData.max_tokens = data.maxTokens
        if (data.temperature !== undefined) updateData.temperature = data.temperature

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('ai_agents')
            .update(updateData)
            .eq('id', id)

        if (error) throw error

        return aiAgentDb.getById(id)
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('ai_agents')
            .delete()
            .eq('id', id)

        if (error) throw error
    },
}

// ============================================================================
// AI TOOLS
// ============================================================================

export const aiToolDb = {
    getByAgent: async (agentId: string): Promise<AITool[]> => {
        const { data, error } = await supabase
            .from('ai_tools')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false })

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            agentId: row.agent_id,
            name: row.name,
            description: row.description,
            parametersSchema: row.parameters_schema,
            webhookUrl: row.webhook_url,
            timeoutMs: row.timeout_ms,
            createdAt: row.created_at,
        }))
    },

    getById: async (id: string): Promise<AITool | null> => {
        const { data, error } = await supabase
            .from('ai_tools')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return null

        return {
            id: data.id,
            agentId: data.agent_id,
            name: data.name,
            description: data.description,
            parametersSchema: data.parameters_schema,
            webhookUrl: data.webhook_url,
            timeoutMs: data.timeout_ms,
            createdAt: data.created_at,
        }
    },

    create: async (data: {
        agentId: string
        name: string
        description: string
        parametersSchema: Record<string, unknown>
        webhookUrl: string
        timeoutMs?: number
    }): Promise<AITool> => {
        const id = generateId()
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('ai_tools')
            .insert({
                id,
                agent_id: data.agentId,
                name: data.name,
                description: data.description,
                parameters_schema: data.parametersSchema,
                webhook_url: data.webhookUrl,
                timeout_ms: data.timeoutMs || 10000,
                created_at: now,
            })

        if (error) throw error

        return {
            id,
            agentId: data.agentId,
            name: data.name,
            description: data.description,
            parametersSchema: data.parametersSchema,
            webhookUrl: data.webhookUrl,
            timeoutMs: data.timeoutMs || 10000,
            createdAt: now,
        }
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('ai_tools')
            .delete()
            .eq('id', id)

        if (error) throw error
    },
}

// ============================================================================
// TOOL EXECUTIONS
// ============================================================================

export const toolExecutionDb = {
    create: async (data: {
        toolId: string
        conversationId: string
        input: Record<string, unknown>
    }): Promise<ToolExecution> => {
        const id = generateId()
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('tool_executions')
            .insert({
                id,
                tool_id: data.toolId,
                conversation_id: data.conversationId,
                input: data.input,
                status: 'pending',
                created_at: now,
            })

        if (error) throw error

        return {
            id,
            toolId: data.toolId,
            conversationId: data.conversationId,
            input: data.input,
            status: 'pending',
            createdAt: now,
        }
    },

    updateResult: async (id: string, data: {
        output?: Record<string, unknown>
        durationMs?: number
        status: ToolExecutionStatus
        error?: string
    }): Promise<void> => {
        const { error: dbError } = await supabase
            .from('tool_executions')
            .update({
                output: data.output,
                duration_ms: data.durationMs,
                status: data.status,
                error: data.error,
            })
            .eq('id', id)

        if (dbError) throw dbError
    },

    fail: async (id: string, error: string, durationMs?: number): Promise<void> => {
        await toolExecutionDb.updateResult(id, {
            status: 'failed',
            error,
            durationMs,
        })
    },

    complete: async (id: string, output: Record<string, unknown>, durationMs?: number): Promise<void> => {
        await toolExecutionDb.updateResult(id, {
            status: 'success',
            output,
            durationMs,
        })
    },
}

// ============================================================================
// FLOW EXECUTIONS
// ============================================================================

export const flowExecutionDb = {
    create: async (data: {
        flowId: string
        mode: 'campaign' | 'chatbot'
        triggerSource?: string
        contactCount?: number
        metadata?: Record<string, unknown>
    }): Promise<{ id: string }> => {
        const id = generateId()
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('flow_executions')
            .insert({
                id,
                flow_id: data.flowId,
                mode: data.mode,
                status: 'pending',
                trigger_source: data.triggerSource,
                contact_count: data.contactCount || 0,
                sent_count: 0,
                delivered_count: 0,
                read_count: 0,
                failed_count: 0,
                metadata: data.metadata,
                created_at: now,
                updated_at: now,
            })

        if (error) throw error

        return { id }
    },

    updateStatus: async (id: string, data: {
        status?: string
        sentCount?: number
        deliveredCount?: number
        readCount?: number
        failedCount?: number
        startedAt?: string
        completedAt?: string
        pausedAt?: string
        errorCode?: number
        errorMessage?: string
    }): Promise<void> => {
        const updateData: Record<string, unknown> = {}

        if (data.status !== undefined) updateData.status = data.status
        if (data.sentCount !== undefined) updateData.sent_count = data.sentCount
        if (data.deliveredCount !== undefined) updateData.delivered_count = data.deliveredCount
        if (data.readCount !== undefined) updateData.read_count = data.readCount
        if (data.failedCount !== undefined) updateData.failed_count = data.failedCount
        if (data.startedAt !== undefined) updateData.started_at = data.startedAt
        if (data.completedAt !== undefined) updateData.completed_at = data.completedAt
        if (data.pausedAt !== undefined) updateData.paused_at = data.pausedAt
        if (data.errorCode !== undefined) updateData.error_code = data.errorCode
        if (data.errorMessage !== undefined) updateData.error_message = data.errorMessage

        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from('flow_executions')
            .update(updateData)
            .eq('id', id)

        if (error) throw error
    },

    getById: async (id: string): Promise<any | null> => {
        const { data, error } = await supabase
            .from('flow_executions')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) return null

        return {
            id: data.id,
            flowId: data.flow_id,
            mode: data.mode,
            status: data.status,
            contactCount: data.contact_count,
            sentCount: data.sent_count,
            deliveredCount: data.delivered_count,
            readCount: data.read_count,
            failedCount: data.failed_count,
            startedAt: data.started_at,
            completedAt: data.completed_at,
            createdAt: data.created_at,
        }
    },

    incrementMetrics: async (id: string, field: 'sent' | 'delivered' | 'read' | 'failed', count: number): Promise<void> => {
        const fieldMap = {
            sent: 'sent_count',
            delivered: 'delivered_count',
            read: 'read_count',
            failed: 'failed_count'
        }
        const dbField = fieldMap[field]
        if (!dbField) return

        // Read current value first (Read-Modify-Write)
        const { data } = await supabase.from('flow_executions').select(dbField).eq('id', id).single()
        const current = data ? data[dbField as keyof typeof data] : 0

        await supabase
            .from('flow_executions')
            .update({ [dbField]: (current as number) + count })
            .eq('id', id)
    },

    getAll: async (options?: {
        mode?: 'campaign' | 'chatbot'
        status?: string
        limit?: number
        offset?: number
    }): Promise<{ executions: FlowExecution[], total: number }> => {
        let query = supabase
            .from('flow_executions')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })

        if (options?.mode) query = query.eq('mode', options.mode)
        if (options?.status) query = query.eq('status', options.status)

        if (options?.limit) {
            const limit = options.limit
            const offset = options.offset || 0
            query = query.range(offset, offset + limit - 1)
        }

        const { data, count, error } = await query

        if (error) throw error

        return {
            executions: (data || []).map(row => ({
                id: row.id,
                flowId: row.flow_id,
                mode: row.mode,
                status: row.status,
                contactCount: row.contact_count,
                sentCount: row.sent_count,
                deliveredCount: row.delivered_count,
                readCount: row.read_count,
                failedCount: row.failed_count,
                startedAt: row.started_at,
                completedAt: row.completed_at,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                errorMessage: row.error_message,
            })),
            total: count || 0
        }
    },
}

// ============================================================================
// NODE EXECUTIONS
// ============================================================================

export const nodeExecutionDb = {
    create: async (data: {
        executionId: string
        nodeId: string
        nodeType: string
        contactPhone?: string
        input?: Record<string, unknown>
    }): Promise<{ id: string }> => {
        const id = generateId()
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('node_executions')
            .insert({
                id,
                execution_id: data.executionId,
                node_id: data.nodeId,
                node_type: data.nodeType,
                contact_phone: data.contactPhone,
                status: 'pending',
                input: data.input,
                retry_count: 0,
                created_at: now,
            })

        if (error) throw error

        return { id }
    },

    getByExecutionId: async (executionId: string, options?: {
        status?: string
        nodeType?: string
        contactPhone?: string
        limit?: number
        offset?: number
    }): Promise<NodeExecution[]> => {
        let query = supabase
            .from('node_executions')
            .select('*')
            .eq('execution_id', executionId)
            .order('created_at', { ascending: false })

        if (options?.status) query = query.eq('status', options.status)
        if (options?.nodeType) query = query.eq('node_type', options.nodeType)
        if (options?.contactPhone) query = query.eq('contact_phone', options.contactPhone)

        if (options?.limit) {
            const limit = options.limit
            const offset = options.offset || 0
            query = query.range(offset, offset + limit - 1)
        }

        const { data, error } = await query

        if (error) throw error

        return (data || []).map(row => ({
            id: row.id,
            executionId: row.execution_id,
            nodeId: row.node_id,
            nodeType: row.node_type,
            contactPhone: row.contact_phone,
            status: row.status,
            input: row.input,
            output: row.output,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            durationMs: row.duration_ms,
            createdAt: row.created_at,
            completedAt: row.completed_at,
            retryCount: row.retry_count,
        }))
    },

    updateStatus: async (id: string, data: {
        status?: string
        output?: Record<string, unknown>
        whatsappMessageId?: string
        errorCode?: number
        errorMessage?: string
        durationMs?: number
        startedAt?: string
        completedAt?: string
        retryCount?: number
    }): Promise<void> => {
        const updateData: Record<string, unknown> = {}

        if (data.status !== undefined) updateData.status = data.status
        if (data.output !== undefined) updateData.output = data.output
        if (data.whatsappMessageId !== undefined) updateData.whatsapp_message_id = data.whatsappMessageId
        if (data.errorCode !== undefined) updateData.error_code = data.errorCode
        if (data.errorMessage !== undefined) updateData.error_message = data.errorMessage
        if (data.durationMs !== undefined) updateData.duration_ms = data.durationMs
        if (data.startedAt !== undefined) updateData.started_at = data.startedAt
        if (data.completedAt !== undefined) updateData.completed_at = data.completedAt
        if (data.retryCount !== undefined) updateData.retry_count = data.retryCount

        const { error } = await supabase
            .from('node_executions')
            .update(updateData)
            .eq('id', id)

        if (error) throw error
    },

    start: async (id: string): Promise<void> => {
        await nodeExecutionDb.updateStatus(id, {
            status: 'running',
            startedAt: new Date().toISOString()
        })
    },

    updateWhatsappMessageId: async (id: string, messageId: string): Promise<void> => {
        await nodeExecutionDb.updateStatus(id, {
            whatsappMessageId: messageId
        })
    },

    fail: async (id: string, error: { errorCode?: number, errorMessage: string }): Promise<void> => {
        await nodeExecutionDb.updateStatus(id, {
            status: 'failed',
            errorCode: error.errorCode,
            errorMessage: error.errorMessage,
            completedAt: new Date().toISOString()
        })
    },

    complete: async (id: string, data: { output?: any }): Promise<void> => {
        await nodeExecutionDb.updateStatus(id, {
            status: 'completed',
            output: data.output,
            completedAt: new Date().toISOString()
        })
    },
}

// ============================================================================
// TEMPLATE PROJECTS (Factory)
// ============================================================================

export const templateProjectDb = {
    getAll: async (): Promise<TemplateProject[]> => {
        const { data, error } = await supabase
            .from('template_workspaces')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as TemplateProject[];
    },

    getById: async (id: string): Promise<TemplateProject & { items: TemplateProjectItem[] }> => {
        // Fetch project
        const { data: project, error: projectError } = await supabase
            .from('template_workspaces')
            .select('*')
            .eq('id', id)
            .single();

        if (projectError) throw projectError;

        // Fetch items
        const { data: items, error: itemsError } = await supabase
            .from('template_project_items')
            .select('*')
            .eq('project_id', id)
            .order('created_at', { ascending: true });

        if (itemsError) throw itemsError;

        return { ...(project as TemplateProject), items: (items as TemplateProjectItem[]) || [] };
    },

    create: async (dto: CreateTemplateProjectDTO): Promise<TemplateProject> => {
        // 1. Create Project
        const { data: project, error: projectError } = await supabase
            .from('template_workspaces')
            .insert({
                title: dto.title,
                prompt: dto.prompt,
                status: dto.status || 'draft',
                template_count: dto.items.length,
                approved_count: 0
                // user_id is explicitly NOT set here, relying on schema default (null) or logic in API route if needed
                // In this single-tenant app, user_id null is acceptable or could be 'admin'
            })
            .select()
            .single();

        if (projectError) throw projectError;

        // 2. Create Items
        if (dto.items.length > 0) {
            const itemsToInsert = dto.items.map(item => ({
                ...item,
                project_id: project.id
            }));

            const { error: itemsError } = await supabase
                .from('template_project_items')
                .insert(itemsToInsert);

            if (itemsError) {
                console.error('Error creating items:', itemsError);
                throw itemsError;
            }
        }

        return project as TemplateProject;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('template_workspaces')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    updateItem: async (id: string, updates: Partial<TemplateProjectItem>): Promise<TemplateProjectItem> => {
        const { data, error } = await supabase
            .from('template_project_items')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as TemplateProjectItem;
    },

    deleteItem: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('template_project_items')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};

