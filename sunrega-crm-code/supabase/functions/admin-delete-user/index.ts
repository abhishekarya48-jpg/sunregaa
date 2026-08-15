import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) throw new Error('Not authenticated')
    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data: { user }, error: authError } = await caller.auth.getUser()
    if (authError || !user) throw new Error('Invalid session')
    const admin = createClient(url, serviceKey)
    const { data: callerProfile } = await admin.from('profiles').select('role,is_active').eq('id', user.id).single()
    if (callerProfile?.role !== 'admin' || !callerProfile.is_active) throw new Error('Administrator access required')

    const { userId } = await request.json()
    if (!userId) throw new Error('User ID is required')
    if (userId === user.id) throw new Error('You cannot delete your own logged-in account')
    const { data: target } = await admin.from('profiles').select('role').eq('id', userId).single()
    if (!target) throw new Error('User not found')
    if (target.role === 'admin') {
      const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true)
      if ((count || 0) <= 1) throw new Error('The final administrator cannot be deleted')
    }
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) throw error
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
