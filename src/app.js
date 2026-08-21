import { seedIfEmpty } from "./services/seed-runtime.js";
import { setActiveView } from "./core/store.js";
import { getSession, getCurrentProfile, refreshProfile, login, logout } from "./services/auth-service.js";
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

const STUB_LABELS = {};

// شاشة دخول حقيقية (Supabase Auth) — تحل محل قفل الـ PIN المحلي القديم.
// تُرجع بروفايل المستخدم بعد دخول ناجح لحساب نشط (auth-service.login ترفض
// الحسابات المعطّلة تلقائيًا).
function showLoginScreen() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "login-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:var(--teal-900);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;";
    overlay.innerHTML = `
      <div style="background:var(--surface);color:var(--ink-800);padding:28px 26px;border-radius:16px;max-width:340px;width:100%;text-align:center;box-shadow:var(--shadow);font-family:var(--font-ui);">
        <div style="width:44px;height:44px;border-radius:12px;background:var(--clay-500);display:flex;align-items:center;justify-content:center;color:var(--teal-900);font-weight:800;font-size:18px;margin:0 auto 14px;">م</div>
        <h2 style="margin:0 0 6px;font-size:16px;">تسجيل الدخول</h2>
        <p class="hint" style="margin:0 0 16px;">مسار — قسم الإرشاد الأكاديمي والتوجيه المهني</p>
        <input id="login-identifier" type="text" autocomplete="username" placeholder="اسم المستخدم أو الإيميل" style="width:100%;box-sizing:border-box;padding:12px;border-radius:9px;border:1px solid var(--border);font-size:14px;margin-bottom:10px;background:var(--surface);color:inherit;font-family:inherit;">
        <input id="login-password" type="password" autocomplete="current-password" placeholder="كلمة المرور" style="width:100%;box-sizing:border-box;padding:12px;border-radius:9px;border:1px solid var(--border);font-size:14px;margin-bottom:10px;background:var(--surface);color:inherit;font-family:inherit;">
        <div id="login-error" style="color:var(--critical);font-size:12px;min-height:16px;margin-bottom:8px;"></div>
        <button id="login-submit" class="btn btn-primary" style="width:100%;">دخول</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const identifierInput = overlay.querySelector("#login-identifier");
    const passwordInput = overlay.querySelector("#login-password");
    const errorEl = overlay.querySelector("#login-error");
    const submitBtn = overlay.querySelector("#login-submit");
    identifierInput.focus();

    const submit = async () => {
      const identifier = identifierInput.value.trim();
      const password = passwordInput.value;
      if (!identifier || !password) {
        errorEl.textContent = "أدخل اسم المستخدم وكلمة المرور";
        return;
      }
      submitBtn.disabled = true;
      errorEl.textContent = "";
      try {
        const profile = await login(identifier, password);
        overlay.remove();
        resolve(profile);
      } catch (err) {
        errorEl.textContent = err.message || "تعذّر تسجيل الدخول";
        passwordInput.value = "";
        passwordInput.focus();
      } finally {
        submitBtn.disabled = false;
      }
    };
    submitBtn.addEventListener("click", submit);
    [identifierInput, passwordInput].forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
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

async function renderView(viewName) {
  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.view === viewName));
  setActiveView(viewName);

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
      await mountStudentsView(main);
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
      await mountPromotedView(main);
      break;
    case "backup":
      await mountBackupView(main);
      break;
    case "users":
      await mountUsersView(main);
      break;
    default:
      mountStub(main, viewName);
  }
  window.scrollTo(0, 0);
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => renderView(btn.dataset.view));
});

function applyProfileToChrome(profile) {
  const nameEl = document.getElementById("current-user-name");
  if (nameEl) nameEl.textContent = profile.full_name || profile.email || "مساحة المرشد";
  const usersNavItem = document.getElementById("users-nav-item");
  if (usersNavItem) usersNavItem.style.display = profile.is_admin ? "" : "none";
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
  applyProfileToChrome(profile);

  await seedIfEmpty();
  await renderView("dashboard");

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      logout();
      window.location.reload();
    });
  }
}

boot();
