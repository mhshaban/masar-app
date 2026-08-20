-- مسار — دالة تجميع درجات الطلبة بجانب قاعدة البيانات (بدل المتصفح).
--
-- السياق: شاشتا الحالات الإرشادية وخطط الدعم (ولوحة "طلاب يحتاجون متابعة"
-- بالرئيسية اللي تستدعيهما معًا) كل واحدة تحسب "أي طالب تحت المعدل أو راسب
-- بمادة" بجلب جدول grades كاملًا للمتصفح ثم الحساب بجافاسكربت
-- (computeStudentGradeSummaries بـ src/modules/grades/grade-flags-service.js).
-- مع نمو الجدول فعليًا (22,982+ صفًا مرصودة) صار هذا يعني عشرات الطلبات
-- المقسّمة صفحات لكل فتح للرئيسية، وتأخر ملموس. الحل: نفس هذا الحساب يصير
-- داخل Postgres نفسه (يستغرق أجزاء من الثانية بغض النظر عن حجم الجدول)،
-- ويرجّع فقط الطلاب المرشَّحين — لا كل الصفوف الخام.
--
-- بدون security definer عمدًا: تنفَّذ بصلاحية المستخدم المستدعي نفسه، فسياسة
-- RLS الحالية على جدول grades (masar_is_active_user()) تُطبَّق تلقائيًا —
-- حساب غير نشط يرجع له صفر صفوف بالضبط متل أي استعلام مباشر على الجدول.
--
-- تشغيل هذا الملف يدويًا عبر SQL Editor بلوحة تحكم مشروع Supabase الخاص
-- بمسار — رفعه لـ GitHub وحده لا يطبّقه (نفس ملاحظة الملف الأول).

begin;

create or replace function public.masar_grade_summaries(p_fail_threshold_pct numeric default 50)
returns table (
  student_id text,
  avg_pct numeric,
  failing_subject_codes text[],
  absent_count integer,
  barred_count integer,
  reasons text[]
)
language sql
stable
as $$
  with rows as (
    select
      data->>'studentId' as student_id,
      data->>'subjectCode' as subject_code,
      data->>'scoreStatus' as score_status,
      nullif(data->>'score', '')::numeric as score,
      nullif(data->>'percentage', '')::numeric as percentage,
      nullif(data->>'maxScore', '')::numeric as max_score
    from public.grades
    where data->>'studentId' is not null
  ),
  pct as (
    -- يطابق gradeRowPct (score-conventions.js) بالضبط: percentage له
    -- الأولوية لو موجود، وإلا score/maxScore (افتراضي 100 لو maxScore مفقود
    -- أو صفر) — والصف يُستبعد من كل حساب لاحق إن كان score فارغًا، تمامًا
    -- متل فلترة "graded" بالنسخة الجافاسكربتية (صف بلا درجة رقمية، مثل
    -- الغياب المُرمَّز 0.5 اللي يتحوّل لـ score=null عند الاستيراد، لا يدخل
    -- بحساب المعدل ولا الرسوب — يُعَدّ فقط ضمن absent_count).
    select
      student_id,
      subject_code,
      score_status,
      score,
      case
        when score is null then null
        when percentage is not null then percentage
        else score / coalesce(nullif(max_score, 0), 100)
      end as pct
    from rows
  ),
  agg as (
    select
      student_id,
      round(avg(pct) filter (where score is not null) * 100) as avg_pct,
      array_remove(array_agg(subject_code) filter (
        where score is not null and round(pct * 100) < p_fail_threshold_pct
      ), null) as failing_subject_codes,
      count(*) filter (where score_status = 'absent')::int as absent_count,
      count(*) filter (where score_status = 'barred')::int as barred_count
    from pct
    group by student_id
  )
  select
    student_id,
    avg_pct,
    coalesce(failing_subject_codes, '{}') as failing_subject_codes,
    absent_count,
    barred_count,
    array_remove(array[
      case when avg_pct is not null and avg_pct < p_fail_threshold_pct
        then format('المعدل العام %s%% أقل من %s%%', avg_pct, p_fail_threshold_pct) end,
      case when coalesce(array_length(failing_subject_codes, 1), 0) > 0
        then format('رسوب في %s %s', array_length(failing_subject_codes, 1),
          case when array_length(failing_subject_codes, 1) = 1 then 'مادة' else 'مواد' end) end,
      case when barred_count > 0
        then format('محروم في %s %s', barred_count,
          case when barred_count = 1 then 'مادة' else 'مواد' end) end
    ], null) as reasons
  from agg
  where
    (avg_pct is not null and avg_pct < p_fail_threshold_pct)
    or coalesce(array_length(failing_subject_codes, 1), 0) > 0
    or barred_count > 0
  -- يطابق (avgPct ?? 0) بالنسخة الجافاسكربتية — طالب بلا معدل (كل صفوفه
  -- محروم/غياب بلا درجة رقمية) يُعامَل كأنه معدله صفر بالترتيب، لا يُدفَع
  -- بالضرورة قبل كل شي.
  order by coalesce(avg_pct, 0);
$$;

grant execute on function public.masar_grade_summaries(numeric) to authenticated;

commit;
