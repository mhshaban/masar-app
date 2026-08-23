// شاشة إدارة المستخدمين — تظهر فقط لدور admin (مع توافق is_admin القديم).
// كل عملية هنا تمر عبر
// admin-users Edge Function بمفتاح service_role من طرف الخادم — لا صلاحيات
// إدارية تُتحقق أو تُمنح من الواجهة نفسها.
import { listUsers, createAccount, setAccountActive, setAccountRole, resetAccountPassword } from "../../services/auth-service.js";
import { loadingHtml, emptyHtml, errorHtml, showToast, confirmDialog } from "../shared/ui-states.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const ROLE_LABELS = { admin: "إدمن", counselor: "مرشد", read_only: "قراءة فقط" };

async function renderList(container) {
  const listRoot = container.querySelector("#users-list");
  listRoot.innerHTML = loadingHtml();

  let users;
  try {
    ({ users } = await listUsers());
  } catch (err) {
    listRoot.innerHTML = errorHtml(`تعذّر تحميل الحسابات: ${err.message}`);
    return;
  }

  if (!users.length) {
    listRoot.innerHTML = emptyHtml("لا يوجد حسابات بعد");
    return;
  }

  listRoot.innerHTML = `
    <table class="table">
      <thead><tr><th>الاسم</th><th>الإيميل</th><th>الحالة</th><th>صلاحية</th><th><span class="sr-only">إجراءات</span></th></tr></thead>
      <tbody>
        ${users.map((u) => {
          const profile = u.profile || {};
          const active = profile.is_active !== false;
          const role = profile.role || (profile.is_admin ? "admin" : "counselor");
          return `
            <tr data-id="${esc(u.id)}">
              <td>${esc(profile.full_name || "—")}</td>
              <td>${esc(u.email || "—")}</td>
              <td>${active ? '<span class="pill pill-success">نشط</span>' : '<span class="pill pill-critical">معطّل</span>'}</td>
              <td>
                <select data-action="role" aria-label="دور ${esc(profile.full_name || u.email || "المستخدم")}" style="padding:7px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:inherit;font-family:inherit;">
                  ${Object.entries(ROLE_LABELS).map(([value, label]) => `<option value="${value}"${role === value ? " selected" : ""}>${label}</option>`).join("")}
                </select>
              </td>
              <td style="display:flex;gap:8px;">
                <button class="link-btn" data-action="toggle" data-active="${active}">${active ? "تعطيل" : "تفعيل"}</button>
                <button class="link-btn" data-action="reset-password">إعادة تعيين كلمة المرور</button>
              </td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;

  listRoot.querySelectorAll("[data-action='toggle']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("[data-id]");
      const userId = row.dataset.id;
      const currentlyActive = btn.dataset.active === "true";
      if (currentlyActive && !confirmDialog("تعطيل هذا الحساب يمنعه من الدخول فورًا — متأكد؟")) return;
      try {
        await setAccountActive(userId, !currentlyActive);
        showToast(currentlyActive ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
        await renderList(container);
      } catch (err) {
        showToast(err.message, { type: "error" });
      }
    });
  });

  listRoot.querySelectorAll("[data-action='role']").forEach((select) => {
    select.addEventListener("change", async () => {
      const userId = select.closest("[data-id]").dataset.id;
      select.disabled = true;
      try {
        await setAccountRole(userId, select.value);
        showToast("تم تحديث صلاحية الحساب");
        await renderList(container);
      } catch (err) {
        showToast(err.message, { type: "error" });
        await renderList(container);
      }
    });
  });

  listRoot.querySelectorAll("[data-action='reset-password']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("[data-id]");
      const userId = row.dataset.id;
      const password = prompt("كلمة المرور الجديدة (٨ أحرف على الأقل):");
      if (!password) return;
      try {
        await resetAccountPassword(userId, password);
        showToast("تم تغيير كلمة المرور");
      } catch (err) {
        showToast(err.message, { type: "error" });
      }
    });
  });
}

export async function mountUsersView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>إدارة المستخدمين</h1><div class="sub">إنشاء الحسابات وتحديد صلاحية الإدمن أو المرشد أو القراءة فقط</div></div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h2>حساب جديد</h2>
      <form id="user-form" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
        <div style="flex:1; min-width:160px;">
          <label class="hint" for="user-form-fullname" style="display:block;margin-bottom:4px;">الاسم الكامل</label>
          <input id="user-form-fullname" name="fullName" required style="width:100%; padding:10px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <div style="flex:1; min-width:140px;">
          <label class="hint" for="user-form-username" style="display:block;margin-bottom:4px;">اسم المستخدم</label>
          <input id="user-form-username" name="username" required placeholder="مثال: m.ahmed" style="width:100%; padding:10px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <div style="flex:1; min-width:140px;">
          <label class="hint" for="user-form-password" style="display:block;margin-bottom:4px;">كلمة المرور</label>
          <input id="user-form-password" name="password" type="password" required minlength="8" style="width:100%; padding:10px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <div>
          <label class="hint" for="user-form-role" style="display:block;margin-bottom:4px;">الدور</label>
          <select id="user-form-role" name="role" style="min-height:44px;padding:9px 12px;border-radius:9px;border:1px solid var(--border);font-family:inherit;background:var(--surface);color:inherit;">
            <option value="counselor">مرشد</option>
            <option value="read_only">قراءة فقط</option>
            <option value="admin">إدمن</option>
          </select>
        </div>
        <button class="btn btn-primary" type="submit">إنشاء الحساب</button>
      </form>
    </div>
    <div class="card"><div id="users-list"></div></div>
  `;

  container.querySelector("#user-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await createAccount({
        fullName: form.fullName.value,
        username: form.username.value,
        password: form.password.value,
        role: form.role.value,
        isAdmin: form.role.value === "admin",
      });
      form.reset();
      showToast("تم إنشاء الحساب");
      await renderList(container);
    } catch (err) {
      showToast(err.message, { type: "error" });
    }
  });

  await renderList(container);
}
