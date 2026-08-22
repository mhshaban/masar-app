// شاشة إدارة المستخدمين — تظهر فقط للحسابات is_admin (راجع app.js:
// users-nav-item يُخفى/يُظهر بحسب profile.is_admin). كل عملية هنا تمر عبر
// admin-users Edge Function بمفتاح service_role من طرف الخادم — لا صلاحيات
// إدارية تُتحقق أو تُمنح من الواجهة نفسها.
import { listUsers, createAccount, setAccountActive, resetAccountPassword } from "../../services/auth-service.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function renderList(container) {
  const listRoot = container.querySelector("#users-list");
  listRoot.innerHTML = '<div class="empty">جارٍ التحميل…</div>';

  let users;
  try {
    ({ users } = await listUsers());
  } catch (err) {
    listRoot.innerHTML = `<div class="empty">تعذّر تحميل الحسابات: ${esc(err.message)}</div>`;
    return;
  }

  if (!users.length) {
    listRoot.innerHTML = '<div class="empty">لا يوجد حسابات بعد</div>';
    return;
  }

  listRoot.innerHTML = `
    <table class="table">
      <thead><tr><th>الاسم</th><th>الإيميل</th><th>الحالة</th><th>صلاحية</th><th><span class="sr-only">إجراءات</span></th></tr></thead>
      <tbody>
        ${users.map((u) => {
          const profile = u.profile || {};
          const active = profile.is_active !== false;
          return `
            <tr data-id="${esc(u.id)}">
              <td>${esc(profile.full_name || "—")}</td>
              <td>${esc(u.email || "—")}</td>
              <td>${active ? '<span class="pill pill-success">نشط</span>' : '<span class="pill pill-critical">معطّل</span>'}</td>
              <td>${profile.is_admin ? '<span class="pill pill-neutral">إدمن</span>' : ""}</td>
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
      if (currentlyActive && !confirm("تعطيل هذا الحساب يمنعه من الدخول فورًا — متأكد؟")) return;
      try {
        await setAccountActive(userId, !currentlyActive);
        await renderList(container);
      } catch (err) {
        alert(err.message);
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
        alert("تم تغيير كلمة المرور.");
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

export async function mountUsersView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>إدارة المستخدمين</h1><div class="sub">إنشاء حسابات المرشدين وتعطيلها — كل حساب نشط له وصول كامل لبيانات الطلاب</div></div>
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
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
          <input type="checkbox" name="isAdmin"> صلاحية إدمن
        </label>
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
        isAdmin: form.isAdmin.checked,
      });
      form.reset();
      await renderList(container);
    } catch (err) {
      alert(err.message);
    }
  });

  await renderList(container);
}
