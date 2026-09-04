// مسار — إدارة الحسابات (Edge Function). نسخة مبسّطة مستوحاة من نمط
// admin-users في تطبيق CCE (بدون نسخ الكود نفسه، وبدون أي تعديل على
// مستودع CCE) — يدير أدوار admin/counselor/read_only من طرف الخادم.
//
// يستخدم service_role key من أسرار بيئة الدالة فقط (تُضبط من لوحة تحكم
// Supabase مباشرة) — هذا المفتاح لا يدخل الكود ولا يُرفع لأي مكان بالمستودع.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

const fail = (message: string, status = 400) => json({ error: message }, status)

const normalizeUsername = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '')
const validUsername = (value: string) => /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value)
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
const validRoles = new Set(['admin', 'counselor', 'read_only'])
// إيميل داخلي اصطناعي عند إنشاء حساب باسم مستخدم فقط (بدون إيميل حقيقي) —
// يطابق نفس منطق masar_resolve_login_identifier بملف SQL (يقارن الجزء قبل
// @ من هذا الإيميل باسم المستخدم المُدخَل بشاشة الدخول).
const internalEmailFor = (username: string) => `${username}@members.masar.local`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  // SUPABASE_URL and the anon/service_role keys are all auto-injected by
  // the platform into every Edge Function already — nothing to add by
  // hand. The legacy single-string names (SUPABASE_ANON_KEY,
  // SUPABASE_SERVICE_ROLE_KEY) still work today but are marked deprecated
  // in favor of SUPABASE_PUBLISHABLE_KEYS/SUPABASE_SECRET_KEYS, which hold
  // a JSON dict of {keyName: keyValue} instead of one plain string — so
  // check the legacy name first, then fall back to picking the first value
  // out of the JSON dict.
  const firstFromJsonMap = (envName: string): string => {
    try {
      const values = JSON.parse(Deno.env.get(envName) ?? '{}') as Record<string, string>
      return values.default ?? Object.values(values)[0] ?? ''
    } catch { return '' }
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? firstFromJsonMap('SUPABASE_PUBLISHABLE_KEYS')
  const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? firstFromJsonMap('SUPABASE_SECRET_KEYS')
  const authorization = req.headers.get('Authorization') ?? ''
  if (!supabaseUrl || !publicKey || !secretKey) return fail('Supabase function secrets are not configured', 500)
  if (!authorization.startsWith('Bearer ')) return fail('Missing session', 401)

  // عميل بجلسة المستدعي نفسه — نتحقق من هويته وصلاحيته بأمان (RLS تسري).
  const userClient = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // عميل بمفتاح الخادم — للعمليات الإدارية الفعلية فقط (تجاوز RLS متعمّد).
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return fail('Invalid or expired session', 401)
  const caller = authData.user

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('id,is_admin,is_active,role')
    .eq('id', caller.id)
    .maybeSingle()
  if (callerProfileError) return fail(callerProfileError.message, 500)
  if (!callerProfile?.is_active || !(callerProfile?.is_admin || callerProfile?.role === 'admin')) {
    return fail('You do not have permission to manage accounts', 403)
  }

  let input: Record<string, unknown>
  try { input = await req.json() } catch { return fail('Invalid JSON body') }
  const action = String(input.action ?? '')

  const audit = async (name: string, recordId: string, before: unknown, after: unknown) => {
    // audit_logs هو جدول اختياري — لو ما كان موجود بعد بقاعدتك، هذا فقط
    // يتجاهل الفشل بصمت بدل ما يوقف العملية الأساسية (إنشاء/تعطيل حساب).
    try {
      await admin.from('audit_logs').insert({
        actor: caller.email ?? caller.id,
        action: name,
        table_name: 'profiles',
        record_id: recordId,
        before_data: before,
        after_data: after,
      })
    } catch { /* اختياري — لا نفشل الطلب بسببه */ }
  }

  try {
    if (action === 'list_users') {
      const { data: authUsers, error: authUsersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (authUsersError) return fail(authUsersError.message, 500)
      const { data: profiles, error: profilesError } = await admin.from('profiles').select('*')
      if (profilesError) return fail(profilesError.message, 500)
      const profileMap = new Map((profiles ?? []).map((p: Record<string, unknown>) => [p.id, p]))
      const users = authUsers.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        profile: profileMap.get(u.id) ?? null,
      }))
      return json({ users })
    }

    if (action === 'create_user') {
      const user = (input.user ?? {}) as Record<string, unknown>
      const username = normalizeUsername(user.username)
      const requestedEmail = String(user.email ?? '').trim().toLowerCase()
      const email = requestedEmail || internalEmailFor(username)
      const password = String(user.password ?? '')
      const fullName = String(user.full_name ?? '').trim()
      const role = validRoles.has(String(user.role ?? '')) ? String(user.role) : (user.is_admin === true ? 'admin' : 'counselor')
      if (!validUsername(username) || !fullName || password.length < 8) {
        return fail('الاسم الكامل، اسم مستخدم صالح، وكلمة مرور 8 أحرف على الأقل مطلوبة')
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, username },
      })
      if (createError || !created.user) return fail(createError?.message ?? 'تعذّر إنشاء الحساب')

      const userId = created.user.id
      const { error: profileError } = await admin.from('profiles').upsert({
        id: userId,
        email,
        full_name: fullName,
        role,
        is_admin: role === 'admin',
        is_active: true,
      })
      if (profileError) {
        await admin.auth.admin.deleteUser(userId)
        return fail(profileError.message)
      }
      await audit('create_user', userId, null, { email, full_name: fullName, role })
      return json({ ok: true, user_id: userId })
    }

    if (action === 'set_active') {
      const userId = String(input.user_id ?? '')
      const isActive = input.is_active === true
      if (!userId) return fail('User id is required')
      if (userId === caller.id && !isActive) return fail('لا يمكنك تعطيل حسابك أنت')
      const { data: oldProfile, error: readError } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (readError) return fail(readError.message, 500)
      const { error } = await admin.from('profiles').update({ is_active: isActive }).eq('id', userId)
      if (error) return fail(error.message)
      await audit(isActive ? 'activate_user' : 'deactivate_user', userId, oldProfile, { ...oldProfile, is_active: isActive })
      return json({ ok: true })
    }

    if (action === 'set_role') {
      const userId = String(input.user_id ?? '')
      const role = String(input.role ?? '')
      if (!userId || !validRoles.has(role)) return fail('دور المستخدم غير صالح')
      if (userId === caller.id && role !== 'admin') return fail('لا يمكنك إزالة صلاحية الإدمن من حسابك أنت')
      const { data: oldProfile, error: readError } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (readError) return fail(readError.message, 500)
      const { error } = await admin.from('profiles').update({ role, is_admin: role === 'admin' }).eq('id', userId)
      if (error) return fail(error.message)
      await audit('set_role', userId, oldProfile, { ...oldProfile, role, is_admin: role === 'admin' })
      return json({ ok: true })
    }

    if (action === 'update_user') {
      const userId = String(input.user_id ?? '')
      const fullName = String(input.full_name ?? '').trim()
      const rawIdentifier = String(input.identifier ?? '').trim().toLowerCase()
      const isEmail = rawIdentifier.includes('@')
      const username = isEmail ? rawIdentifier.split('@')[0] : normalizeUsername(rawIdentifier)
      const email = isEmail ? rawIdentifier : internalEmailFor(username)
      if (!userId || !fullName || fullName.length > 120) return fail('الاسم الكامل مطلوب وبحد أقصى 120 حرفًا')
      if ((isEmail && !validEmail(email)) || (!isEmail && !validUsername(username))) {
        return fail('أدخل بريدًا إلكترونيًا صحيحًا أو اسم مستخدم من 3 إلى 32 حرفًا إنجليزيًا')
      }

      const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(userId)
      if (authUserError || !authUserData.user) return fail(authUserError?.message ?? 'الحساب غير موجود', 404)
      const { data: oldProfile, error: readError } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (readError) return fail(readError.message, 500)
      if (!oldProfile) return fail('ملف المستخدم غير موجود', 404)
      const { data: otherProfiles, error: duplicateReadError } = await admin
        .from('profiles').select('id,email').neq('id', userId)
      if (duplicateReadError) return fail(duplicateReadError.message, 500)
      if ((otherProfiles ?? []).some((profile) => String(profile.email ?? '').toLowerCase().split('@')[0] === username)) {
        return fail('اسم المستخدم مستخدم لحساب آخر')
      }

      const oldEmail = authUserData.user.email ?? oldProfile?.email ?? ''
      const oldMetadata = authUserData.user.user_metadata ?? {}
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
        user_metadata: { ...oldMetadata, full_name: fullName, username },
      })
      if (authUpdateError) return fail(authUpdateError.message)

      const { error: profileUpdateError } = await admin.from('profiles').update({
        email,
        full_name: fullName,
      }).eq('id', userId)
      if (profileUpdateError) {
        // Auth وpublic.profiles ليسا ضمن معاملة واحدة؛ نعيد Auth لقيمه السابقة
        // إذا فشل تحديث الملف حتى لا يصبح تسجيل الدخول غير متطابق.
        await admin.auth.admin.updateUserById(userId, {
          email: oldEmail,
          email_confirm: true,
          user_metadata: oldMetadata,
        })
        return fail(profileUpdateError.message)
      }

      await audit('update_user', userId,
        { email: oldEmail, full_name: oldProfile?.full_name ?? '' },
        { email, full_name: fullName })
      return json({ ok: true, self_updated: userId === caller.id })
    }

    if (action === 'reset_password') {
      const userId = String(input.user_id ?? '')
      const password = String(input.password ?? '')
      if (!userId || password.length < 8) return fail('كلمة مرور 8 أحرف على الأقل مطلوبة')
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return fail(error.message)
      await audit('reset_password', userId, null, { password: '[protected]' })
      return json({ ok: true })
    }

    return fail('Unknown action', 404)
  } catch (error) {
    console.error(error)
    return fail(error instanceof Error ? error.message : 'Unexpected server error', 500)
  }
})
