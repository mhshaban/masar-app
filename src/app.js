import { setActiveView } from "./core/store.js";
import {
  getSession,
  getCurrentProfile,
  refreshProfile,
  login,
  logout,
  consumeSessionExpiredNotice,
  requestPasswordReset,
  consumeRecoverySession,
  updateRecoveredPassword,
  needsInitialSetup,
  createInitialAdmin,
} from "./services/auth-service.js?v=local-1";

const VIEW_LOADERS = {
  dashboard: async () => (await import("./modules/dashboard/dashboard-ui.js")).mountDashboardView,
  plan: async () => (await import("./modules/department-plan/department-plan-ui.js?v=2026-2027-1")).mountDepartmentPlanView,
  agenda: async () => (await import("./modules/agenda/agenda-ui.js")).mountAgendaView,
  students: async () => (await import("./modules/students/students-ui.js")).mountStudentsView,
  grades: async () => (await import("./modules/grades/grades-ui.js")).mountGradesView,
  cases: async () => (await import("./modules/cases/guidance-ui.js")).mountCasesView,
  support: async () => (await import("./modules/support/support-ui.js")).mountSupportView,
  career: async () => (await import("./modules/career/career-ui.js")).mountCareerView,
  promoted: async () => (await import("./modules/promoted/promoted-ui.js")).mountPromotedView,
  forms: async () => (await import("./modules/forms/forms-ui.js?v=2026-08-30-3")).mountFormsView,
  backup: async () => (await import("./modules/backup/backup-ui.js")).mountBackupView,
  users: async () => (await import("./modules/users/users-ui.js")).mountUsersView,
  imports: async () => (await import("./modules/imports/imports-ui.js")).mountImportsView,
};
const VIEW_OPTIONS = {
  dashboard: () => ({ onGoto: renderView }),
  students: () => ({ onGoto: renderView }),
  grades: () => ({ onGoto: renderView }),
  promoted: () => ({ onGoto: renderView }),
};
const ADMIN_VIEWS = new Set(["imports", "backup", "users"]);
const loadedViews = new Map();
let currentProfile = null;

function isAdmin(profile) {
  return profile?.role === "admin" || profile?.is_admin === true;
}

// شاشة الدخول المحلية — الحسابات والصلاحيات محفوظة داخل قاعدة هذا المتصفح.
// واجهة مستقلة تمامًا: تُبنى داخل #login-root (خارج #app-shell المخفي
// بـ hidden منذ التحميل الأول)، فلا تظهر أي عناصر من القائمة/المحتوى قبل
// نجاح الدخول ولا تقدر تستقبل تركيز أو نقر (hidden = خارج شجرة الوصولية
// تمامًا، ليس مجرد إخفاء بصري). تُرجع بروفايل المستخدم بعد دخول ناجح
// لحساب نشط (auth-service.login ترفض الحسابات المعطّلة تلقائيًا).
function showLoginScreen() {
  return new Promise((resolve) => {
    const root = document.getElementById("login-root");
    const sessionExpired = consumeSessionExpiredNotice();

    root.innerHTML = `
      <main class="login-screen" aria-labelledby="login-title">
        <form class="login-card" id="login-form" novalidate>
          <div class="login-mark" aria-hidden="true">م</div>
          <h1 id="login-title">تسجيل الدخول</h1>
          <p class="login-sub">تابع أداء الطلبة، خطط الدعم، والحالات الأكاديمية من مساحة واحدة</p>
          ${sessionExpired ? `
            <div class="login-notice info" role="status">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
              <span>انتهت جلستك السابقة — سجّل الدخول من جديد للمتابعة.</span>
            </div>
          ` : ""}
          <div class="login-field">
            <label for="login-identifier">اسم المستخدم أو البريد الإلكتروني</label>
            <input id="login-identifier" name="identifier" type="text" autocomplete="username" required aria-describedby="login-error">
          </div>
          <div class="login-field">
            <label for="login-password">كلمة المرور</label>
            <div class="password-control">
              <input id="login-password" name="password" type="password" autocomplete="current-password" required aria-describedby="login-error">
              <button type="button" class="password-toggle" id="password-toggle" aria-label="إظهار كلمة المرور" aria-pressed="false">إظهار</button>
            </div>
          </div>
          <div id="login-error" class="login-notice error" role="status" aria-live="polite" hidden></div>
          <button type="submit" class="btn btn-primary login-submit" id="login-submit">دخول</button>
          <p class="login-forgot"><button type="button" class="link-btn" id="forgot-password">هل نسيت كلمة المرور؟</button></p>
        </form>
      </main>
    `;

    const form = root.querySelector("#login-form");
    const identifierInput = root.querySelector("#login-identifier");
    const passwordInput = root.querySelector("#login-password");
    const errorEl = root.querySelector("#login-error");
    const submitBtn = root.querySelector("#login-submit");
    const passwordToggle = root.querySelector("#password-toggle");
    const forgotPassword = root.querySelector("#forgot-password");
    identifierInput.focus();

    passwordToggle.addEventListener("click", () => {
      const show = passwordInput.type === "password";
      passwordInput.type = show ? "text" : "password";
      passwordToggle.textContent = show ? "إخفاء" : "إظهار";
      passwordToggle.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
      passwordToggle.setAttribute("aria-pressed", show ? "true" : "false");
      passwordInput.focus();
    });

    const showError = (message) => {
      errorEl.classList.remove("info");
      errorEl.classList.add("error");
      errorEl.textContent = message;
      errorEl.hidden = false;
      identifierInput.setAttribute("aria-invalid", "true");
      passwordInput.setAttribute("aria-invalid", "true");
    };
    const clearError = () => {
      errorEl.classList.remove("info");
      errorEl.classList.add("error");
      errorEl.textContent = "";
      errorEl.hidden = true;
      identifierInput.removeAttribute("aria-invalid");
      passwordInput.removeAttribute("aria-invalid");
    };

    forgotPassword.addEventListener("click", async () => {
      const identifier = identifierInput.value.trim();
      if (!identifier) {
        showError("أدخل اسم المستخدم أو البريد الإلكتروني أولًا.");
        identifierInput.focus();
        return;
      }
      clearError();
      forgotPassword.disabled = true;
      try {
        await requestPasswordReset(identifier);
        errorEl.classList.remove("error");
        errorEl.classList.add("info");
        errorEl.textContent = "إذا كان الحساب مرتبطًا ببريد صالح فسيصلك رابط استرجاع كلمة المرور.";
        errorEl.hidden = false;
      } catch (error) {
        showError(error.message || "تعذر إرسال رابط الاسترجاع. حاول لاحقًا.");
      } finally {
        forgotPassword.disabled = false;
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitBtn.disabled) return; // يمنع إرسال متكرر لو ضُغط الزر أو Enter مرتين بسرعة
      const identifier = identifierInput.value.trim();
      const password = passwordInput.value;
      if (!identifier || !password) {
        showError("يرجى إدخال اسم المستخدم وكلمة المرور");
        return;
      }
      clearError();
      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = "جارٍ تسجيل الدخول…";
      try {
        // لا نسجّل identifier ولا password هنا ولا بأي سجل تشخيصي. تحتفظ
        // قاعدة الجهاز فقط بمشتق مشفّر ومملّح للتحقق من كلمة المرور.
        const profile = await login(identifier, password);
        resolve(profile);
      } catch (err) {
        showError(err.message || "تعذر تسجيل الدخول. تحقق من بياناتك أو تواصل مع مسؤول النظام.");
        passwordInput.value = "";
        passwordInput.focus();
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  });
}

function showInitialSetupScreen({ offerCloudTransfer = false } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById("login-root");
    root.innerHTML = `
      <main class="login-screen" aria-labelledby="setup-title">
        <div class="login-card">
          <div class="login-mark" aria-hidden="true">م</div>
          <h1 id="setup-title">إعداد مسار المحلي</h1>
          <p class="login-sub">أنشئ حساب المدير المحلي. تحفظ كلمة المرور مشفّرة على هذا الجهاز ولا تُرسل لأي خادم.</p>
          ${offerCloudTransfer ? `<form id="cloud-transfer-form" class="setup-transfer" novalidate>
            <h2>أولًا: نقل بيانات مسار الحالية</h2>
            <p class="login-sub">أدخل حساب Supabase القديم مرة واحدة لنسخ الخطة والطلبة والدرجات والاستمارات والمعلمين إلى هذا الجهاز. لن تُحذف النسخة السحابية.</p>
            <div class="login-field"><label for="cloud-email">البريد الإلكتروني في مسار القديم</label><input id="cloud-email" name="email" type="email" required autocomplete="username"></div>
            <div class="login-field"><label for="cloud-password">كلمة مرور مسار القديم</label><input id="cloud-password" name="password" type="password" required autocomplete="current-password"></div>
            <div id="cloud-transfer-error" class="login-notice error" role="status" hidden></div>
            <button class="btn btn-ghost login-submit" type="submit">نقل البيانات من Supabase</button>
          </form><hr class="setup-divider">` : ""}
          <form id="local-setup-form" novalidate>
          <h2>${offerCloudTransfer ? "ثانيًا: إنشاء المدير المحلي" : "إنشاء المدير المحلي"}</h2>
          <div class="login-field"><label for="setup-full-name">الاسم الكامل</label><input id="setup-full-name" name="fullName" required autocomplete="name"></div>
          <div class="login-field"><label for="setup-username">اسم المستخدم</label><input id="setup-username" name="username" required autocomplete="username"></div>
          <div class="login-field"><label for="setup-email">البريد الإلكتروني (اختياري)</label><input id="setup-email" name="email" type="email" autocomplete="email"></div>
          <div class="login-field"><label for="setup-password">كلمة المرور المحلية</label><input id="setup-password" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
          <div class="login-field"><label for="setup-confirm">تأكيد كلمة المرور</label><input id="setup-confirm" name="confirm" type="password" minlength="8" required autocomplete="new-password"></div>
          <div id="setup-error" class="login-notice error" role="status" hidden></div>
          <button class="btn btn-primary login-submit" type="submit">إنشاء حساب المدير</button>
          </form>
        </div>
      </main>`;
    const transferForm = root.querySelector("#cloud-transfer-form");
    transferForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = transferForm.querySelector("button[type=submit]");
      const error = transferForm.querySelector("#cloud-transfer-error");
      error.hidden = true; button.disabled = true; button.textContent = "جارٍ نقل البيانات…";
      try {
        const { authenticateAndMigrateCloudData } = await import("./services/local-migration-service.js?v=local-2");
        await authenticateAndMigrateCloudData(transferForm.email.value, transferForm.password.value, {
          onProgress: ({ index, total }) => { button.textContent = `جارٍ النقل… ${index + 1} من ${total}`; },
        });
        location.reload();
      } catch (err) {
        error.textContent = err.message || "تعذر نقل البيانات"; error.hidden = false;
        button.disabled = false; button.textContent = "نقل البيانات من Supabase";
      }
    });
    const form = root.querySelector("#local-setup-form");
    const error = root.querySelector("#setup-error");
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); error.hidden = true;
      if (form.password.value !== form.confirm.value) { error.textContent = "كلمتا المرور غير متطابقتين"; error.hidden = false; return; }
      const button = form.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "جارٍ الحفظ…";
      try {
        await createInitialAdmin({ fullName: form.fullName.value, username: form.username.value, email: form.email.value, password: form.password.value });
        resolve();
      } catch (err) { error.textContent = err.message; error.hidden = false; button.disabled = false; button.textContent = "إنشاء حساب المدير"; }
    });
  });
}

function showPasswordRecoveryScreen() {
  return new Promise((resolve) => {
    const root = document.getElementById("login-root");
    root.innerHTML = `
      <main class="login-screen" aria-labelledby="recovery-title">
        <form class="login-card" id="recovery-form" novalidate>
          <div class="login-mark" aria-hidden="true">م</div>
          <h1 id="recovery-title">تعيين كلمة مرور جديدة</h1>
          <p class="login-sub">اختر كلمة مرور قوية لا تقل عن 8 أحرف.</p>
          <div class="login-field">
            <label for="recovery-password">كلمة المرور الجديدة</label>
            <input id="recovery-password" type="password" autocomplete="new-password" minlength="8" required>
          </div>
          <div class="login-field">
            <label for="recovery-confirm">تأكيد كلمة المرور</label>
            <input id="recovery-confirm" type="password" autocomplete="new-password" minlength="8" required>
          </div>
          <div id="recovery-error" class="login-notice error" role="status" aria-live="polite" hidden></div>
          <button type="submit" class="btn btn-primary login-submit">حفظ كلمة المرور</button>
        </form>
      </main>
    `;
    const form = root.querySelector("#recovery-form");
    const password = root.querySelector("#recovery-password");
    const confirm = root.querySelector("#recovery-confirm");
    const errorEl = root.querySelector("#recovery-error");
    const button = form.querySelector("button[type=submit]");
    password.focus();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorEl.hidden = true;
      if (password.value.length < 8) {
        errorEl.textContent = "كلمة المرور يجب ألا تقل عن 8 أحرف.";
        errorEl.hidden = false;
        return;
      }
      if (password.value !== confirm.value) {
        errorEl.textContent = "كلمتا المرور غير متطابقتين.";
        errorEl.hidden = false;
        return;
      }
      button.disabled = true;
      button.textContent = "جارٍ الحفظ…";
      try {
        await updateRecoveredPassword(password.value);
        root.innerHTML = `
          <main class="login-screen"><div class="login-card recovery-success" role="status">
            <div class="login-mark" aria-hidden="true">م</div>
            <h1>تم تحديث كلمة المرور</h1>
            <p>يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.</p>
            <button type="button" class="btn btn-primary" id="return-login">العودة لتسجيل الدخول</button>
          </div></main>`;
        root.querySelector("#return-login").addEventListener("click", resolve);
      } catch (error) {
        errorEl.textContent = error.message || "تعذر تحديث كلمة المرور.";
        errorEl.hidden = false;
        button.disabled = false;
        button.textContent = "حفظ كلمة المرور";
      }
    });
  });
}

function loadView(viewName) {
  if (!loadedViews.has(viewName)) {
    const pending = VIEW_LOADERS[viewName]().catch((error) => {
      loadedViews.delete(viewName);
      throw error;
    });
    loadedViews.set(viewName, pending);
  }
  return loadedViews.get(viewName);
}

const main = document.getElementById("main-view");
const navButtons = Array.from(document.querySelectorAll(".navitem"));
const KNOWN_VIEWS = new Set(navButtons.map((b) => b.dataset.view));

// درج القائمة الجانبية على الهاتف: زر بالشريط العلوي يفتحه، وخلفية شفّافة
// (backdrop) خلفه — النقر عليها أو Escape أو اختيار صفحة يغلقه تلقائيًا.
// على سطح المكتب هذي العناصر مخفية بالـCSS أصلًا (.nav-toggle display:none
// خارج media query الهاتف)، فـtoggleMobileNav هنا بلا أي أثر مرئي هناك.
const navToggleBtn = document.getElementById("nav-toggle");
const navBackdrop = document.getElementById("nav-backdrop");
const mainNav = document.getElementById("main-nav");

function setMobileNavOpen(open) {
  mainNav.classList.toggle("open", open);
  navBackdrop.hidden = !open;
  navToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
}
function closeMobileNav() { setMobileNavOpen(false); }

if (navToggleBtn) {
  navToggleBtn.addEventListener("click", () => setMobileNavOpen(!mainNav.classList.contains("open")));
  navBackdrop.addEventListener("click", closeMobileNav);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mainNav.classList.contains("open")) closeMobileNav();
  });
}

// يحفظ الصفحة الحالية بـ location.hash (replaceState، بلا تراكم سجلّ تصفّح
// لكل ضغطة تنقّل داخلية) — فقط عشان تبقى نفس الصفحة لو المستخدم عمل
// تحديث (F5) للمتصفح، بدون بناء نظام توجيه كامل جديد غير موجود أصلًا.
async function renderView(viewName) {
  if (!VIEW_LOADERS[viewName]) viewName = "dashboard";
  if (ADMIN_VIEWS.has(viewName) && !isAdmin(currentProfile)) viewName = "dashboard";
  navButtons.forEach((b) => {
    const active = b.dataset.view === viewName;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  setActiveView(viewName);
  history.replaceState(null, "", `#${viewName}`);
  main.setAttribute("aria-busy", "true");
  closeMobileNav();
  main.innerHTML = '<div class="empty view-loading" role="status">جارٍ تحميل الصفحة…</div>';

  try {
    const mount = await loadView(viewName);
    await mount(main, VIEW_OPTIONS[viewName]?.() || undefined);
    if (currentProfile?.role === "read_only") {
      main.insertAdjacentHTML("afterbegin", '<div class="readonly-banner" role="status">أنت في وضع القراءة فقط — عمليات التعديل محمية من قاعدة البيانات.</div>');
    }
  } catch (error) {
    console.error("تعذر تحميل الصفحة", error);
    main.innerHTML = `
      <div class="card load-failure" role="alert">
        <h1>تعذر تحميل الصفحة</h1>
        <p>تحقق من اتصال الإنترنت ثم حاول مجددًا.</p>
        <button type="button" class="btn btn-primary" id="retry-view">إعادة المحاولة</button>
      </div>
    `;
    main.querySelector("#retry-view")?.addEventListener("click", () => renderView(viewName));
  }
  main.removeAttribute("aria-busy");
  window.scrollTo(0, 0);
  // يرجّع التركيز لأعلى المحتوى الرئيسي بعد كل تنقّل — يفيد مستخدمي لوحة
  // المفاتيح وقارئات الشاشة، بدل ما يضل التركيز على زر بالقائمة الجانبية
  // بعيدًا عن المحتوى الجديد فعليًا.
  main.focus({ preventScroll: true });
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => renderView(btn.dataset.view));
});

function applyProfileToChrome(profile) {
  const role = profile.role || (profile.is_admin ? "admin" : "counselor");
  const admin = isAdmin(profile);
  document.documentElement.dataset.userRole = role;
  const nameEl = document.getElementById("current-user-name");
  if (nameEl) nameEl.textContent = profile.full_name || profile.email || "مساحة المرشد";
  const usersNavItem = document.getElementById("users-nav-item");
  if (usersNavItem) usersNavItem.style.display = admin ? "" : "none";
  const importsNavItem = document.getElementById("imports-nav-item");
  if (importsNavItem) importsNavItem.style.display = admin ? "" : "none";
  const backupNavItem = document.getElementById("backup-nav-item");
  if (backupNavItem) backupNavItem.style.display = admin ? "" : "none";
  const roleEl = document.getElementById("current-user-role");
  if (roleEl) roleEl.textContent = ({ admin: "إدمن", counselor: "مرشد", read_only: "قراءة فقط" })[role] || "مرشد";
}

async function showBackupReminder() {
  const { get } = await import("./services/local-runtime.js");
  const last = await get("appSettings", "last-backup-export");
  const age = last?.exportedAt ? Date.now() - new Date(last.exportedAt).getTime() : Infinity;
  if (age < 7 * 24 * 60 * 60 * 1000) return;
  const reminder = document.createElement("div");
  reminder.className = "readonly-banner";
  reminder.innerHTML = 'مرّ أسبوع أو لم تُنشأ نسخة احتياطية محلية بعد. <button class="link-btn" type="button">فتح النسخ الاحتياطي</button>';
  reminder.querySelector("button").addEventListener("click", () => renderView("backup"));
  main.prepend(reminder);
}

async function boot() {
  const loginRoot = document.getElementById("login-root");
  loginRoot.innerHTML = '<main class="login-screen"><div class="login-card"><div class="login-mark">م</div><h1>تهيئة مسار المحلي</h1><p class="login-sub" id="migration-progress">جارٍ التحقق من البيانات المحلية…</p></div></main>';
  let migrationStatus = null;
  try {
    const { migrateCloudDataOnce } = await import("./services/local-migration-service.js?v=local-2");
    migrationStatus = await migrateCloudDataOnce({ onProgress: ({ index, total }) => {
      const el = document.getElementById("migration-progress");
      if (el) el.textContent = `جارٍ نسخ بيانات مسار بأمان… ${index + 1} من ${total}`;
    } });
  } catch (error) {
    console.warn("تعذر الترحيل التلقائي من النسخة السحابية", error);
  }
  if (await needsInitialSetup()) await showInitialSetupScreen({ offerCloudTransfer: !migrationStatus?.completed });
  if (consumeRecoverySession()) {
    await showPasswordRecoveryScreen();
  }
  let profile = getSession() ? getCurrentProfile() : null;
  // جلسة محفوظة من نفس التبويب (sessionStorage) — نتأكد إنها لسا صالحة
  // وإن الحساب لا يزال موجودًا ونشطًا قبل الوثوق بها.
  if (profile) {
    profile = await refreshProfile();
    if (!profile || !profile.is_active) profile = null;
  }
  if (!profile) {
    profile = await showLoginScreen();
  }
  currentProfile = profile;

  // دخول ناجح فعليًا من هنا — نظهر هيكل التطبيق (كان hidden منذ التحميل
  // الأول، خارج شجرة الوصولية تمامًا) ونحذف شاشة الدخول نهائيًا من الصفحة.
  document.getElementById("app-shell").hidden = false;
  document.getElementById("login-root").innerHTML = "";

  applyProfileToChrome(profile);

  const { seedIfEmpty } = await import("./services/seed-runtime.js");
  await seedIfEmpty();
  // يحافظ على الصفحة الحالية بعد تحديث المتصفح (F5) لو كان الهاش يطابق
  // صفحة معروفة فعليًا — وإلا يرجع للرئيسية كسلوك افتراضي آمن.
  const initialView = KNOWN_VIEWS.has(location.hash.slice(1)) ? location.hash.slice(1) : "dashboard";
  await renderView(initialView);
  await showBackupReminder();

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      logout();
      window.location.reload();
    });
  }
}

boot();
import("./pwa.js").then(({ initPwa }) => initPwa()).catch(() => {});
