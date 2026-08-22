import { seedIfEmpty } from "./services/seed-runtime.js";
import { setActiveView } from "./core/store.js";
import { getSession, getCurrentProfile, refreshProfile, login, logout, consumeSessionExpiredNotice } from "./services/auth-service.js";
import { mountDashboardView } from "./modules/dashboard/dashboard-ui.js";
import { mountDepartmentPlanView } from "./modules/department-plan/department-plan-ui.js";
import { mountAgendaView } from "./modules/agenda/agenda-ui.js";
import { mountStudentsView } from "./modules/students/students-ui.js";
import { mountGradesView } from "./modules/grades/grades-ui.js";
import { mountCasesView } from "./modules/cases/guidance-ui.js";
import { mountSupportView } from "./modules/support/support-ui.js";
import { mountCareerView } from "./modules/career/career-ui.js";
import { mountPromotedView } from "./modules/promoted/promoted-ui.js";
import { mountBackupView } from "./modules/backup/backup-ui.js";
import { mountUsersView } from "./modules/users/users-ui.js";
import { mountImportsView } from "./modules/imports/imports-ui.js";

const STUB_LABELS = {};

// شاشة دخول حقيقية (Supabase Auth) — تحل محل قفل الـ PIN المحلي القديم.
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
            <input id="login-password" name="password" type="password" autocomplete="current-password" required aria-describedby="login-error">
          </div>
          <div id="login-error" class="login-notice error" role="status" aria-live="polite" hidden></div>
          <button type="submit" class="btn btn-primary login-submit" id="login-submit">دخول</button>
          <p class="login-forgot">هل نسيت كلمة المرور؟ لا يوجد استرجاع ذاتي حاليًا — تواصل مع مسؤول النظام بالقسم لإعادة تعيينها.</p>
        </form>
      </main>
    `;

    const form = root.querySelector("#login-form");
    const identifierInput = root.querySelector("#login-identifier");
    const passwordInput = root.querySelector("#login-password");
    const errorEl = root.querySelector("#login-error");
    const submitBtn = root.querySelector("#login-submit");
    identifierInput.focus();

    const showError = (message) => {
      errorEl.textContent = message;
      errorEl.hidden = false;
      identifierInput.setAttribute("aria-invalid", "true");
      passwordInput.setAttribute("aria-invalid", "true");
    };
    const clearError = () => {
      errorEl.textContent = "";
      errorEl.hidden = true;
      identifierInput.removeAttribute("aria-invalid");
      passwordInput.removeAttribute("aria-invalid");
    };

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
        // لا نسجّل identifier ولا password هنا ولا بأي مكان آخر — لا console،
        // لا localStorage. التوكن نفسه يُخزَّن بـ sessionStorage فقط (راجع
        // supabase-config.js)، وكلمة المرور لا تُخزَّن إطلاقًا بعد هذي النقطة.
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

function mountStub(container, viewName) {
  const info = STUB_LABELS[viewName] || { title: viewName, note: "" };
  container.innerHTML = `
    <div class="topbar"><div><h1>${info.title}</h1><div class="sub">قيد الإنشاء</div></div></div>
    <div class="card"><div class="empty">${info.note}</div></div>
  `;
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

  switch (viewName) {
    case "dashboard":
      await mountDashboardView(main, { onGoto: renderView });
      break;
    case "plan":
      await mountDepartmentPlanView(main);
      break;
    case "agenda":
      await mountAgendaView(main);
      break;
    case "students":
      await mountStudentsView(main, { onGoto: renderView });
      break;
    case "grades":
      await mountGradesView(main, { onGoto: renderView });
      break;
    case "cases":
      await mountCasesView(main);
      break;
    case "support":
      await mountSupportView(main);
      break;
    case "career":
      await mountCareerView(main);
      break;
    case "promoted":
      await mountPromotedView(main, { onGoto: renderView });
      break;
    case "backup":
      await mountBackupView(main);
      break;
    case "users":
      await mountUsersView(main);
      break;
    case "imports":
      await mountImportsView(main);
      break;
    default:
      mountStub(main, viewName);
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
  const nameEl = document.getElementById("current-user-name");
  if (nameEl) nameEl.textContent = profile.full_name || profile.email || "مساحة المرشد";
  const usersNavItem = document.getElementById("users-nav-item");
  if (usersNavItem) usersNavItem.style.display = profile.is_admin ? "" : "none";
  const importsNavItem = document.getElementById("imports-nav-item");
  if (importsNavItem) importsNavItem.style.display = profile.is_admin ? "" : "none";
}

async function boot() {
  let profile = getSession() ? getCurrentProfile() : null;
  // جلسة محفوظة من نفس التبويب (sessionStorage) — نتأكد إنها لسا صالحة
  // وإن الحساب لسا نشط قبل ما نثق فيها (لو تم تعطيله بالسحابة بالمنتصف).
  if (profile) {
    profile = await refreshProfile();
    if (!profile || !profile.is_active) profile = null;
  }
  if (!profile) {
    profile = await showLoginScreen();
  }

  // دخول ناجح فعليًا من هنا — نظهر هيكل التطبيق (كان hidden منذ التحميل
  // الأول، خارج شجرة الوصولية تمامًا) ونحذف شاشة الدخول نهائيًا من الصفحة.
  document.getElementById("app-shell").hidden = false;
  document.getElementById("login-root").innerHTML = "";

  applyProfileToChrome(profile);

  await seedIfEmpty();
  // يحافظ على الصفحة الحالية بعد تحديث المتصفح (F5) لو كان الهاش يطابق
  // صفحة معروفة فعليًا — وإلا يرجع للرئيسية كسلوك افتراضي آمن.
  const initialView = KNOWN_VIEWS.has(location.hash.slice(1)) ? location.hash.slice(1) : "dashboard";
  await renderView(initialView);

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      logout();
      window.location.reload();
    });
  }
}

boot();
