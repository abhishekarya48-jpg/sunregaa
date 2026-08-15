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
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) throw new Error('Invalid session')

    const adminClient = createClient(url, serviceKey)
    const { data: profile } = await adminClient.from('profiles').select('role,is_active').eq('id', user.id).single()
    if (profile?.role !== 'admin' || !profile.is_active) throw new Error('Administrator access required')

    const { fullName, email, password, role = 'worker' } = await request.json()
    if (!fullName || !email || !password) throw new Error('Name, email and password are required')
    if (password.length < 8) throw new Error('Password must contain at least 8 characters')
    if (!['admin', 'worker'].includes(role)) throw new Error('Invalid role')

    const { data, error } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase().trim(), password, email_confirm: true,
      user_metadata: { full_name: fullName.trim(), role },
    })
    if (error) throw error
    return new Response(JSON.stringify({ user: { id: data.user.id, email: data.user.email } }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
