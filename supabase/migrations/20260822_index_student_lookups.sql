-- مسار — فهارس على حقول jsonb المستخدمة بكثرة لفلترة سجلات طالب واحد
-- (`listWhere` بـ`cloud-runtime.js`)، بدون تغيير أي سلوك ظاهر بالتطبيق.
--
-- بدون هذه الفهارس، كل استدعاء `listWhere(collection, "studentId", id)`
-- (المسار الأكاديمي لطالب، معدلاته الفصلية، مقرراته المرفعة، جلسات
-- توجيهه المهني...) يفحص كل صفوف الجدول تسلسليًا بحثًا عن استخراج
-- `data->>'studentId'` المطابق — لا مشكلة عملية بعد بحجم البيانات الحالي
-- (22,982+ صف درجات)، لكنها ستتباطأ خطيًا مع كل فصل دراسي جديد يُستورد.
-- فهرس دالي (functional index) على نفس التعبير المستخدم بالاستعلام يحوّل
-- الفحص لبحث فهرس مباشر بدل مسح الجدول كاملًا.
--
-- teacherSchedule يُفلتر بحسب الشعبة (section) لا الطالب — نفس المنطق،
-- حقل مختلف (راجع schedule-service.js).

begin;

create index if not exists grades_student_id_idx
  on public.grades ((data ->> 'studentId'));

create index if not exists term_averages_student_id_idx
  on public."termAverages" ((data ->> 'studentId'));

create index if not exists promoted_subjects_student_id_idx
  on public."promotedSubjects" ((data ->> 'studentId'));

create index if not exists career_sessions_student_id_idx
  on public."careerSessions" ((data ->> 'studentId'));

create index if not exists teacher_schedule_section_idx
  on public."teacherSchedule" ((data ->> 'section'));

commit;
