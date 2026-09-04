// شاشة إدارة المستخدمين — تظهر فقط لدور admin (مع توافق is_admin القديم).
// كل عملية هنا تمر عبر
// admin-users Edge Function بمفتاح service_role من طرف الخادم — لا صلاحيات
// إدارية تُتحقق أو تُمنح من الواجهة نفسها.
import { listUsers, createAccount, setAccountActive, setAccountRole, resetAccountPassword, updateAccount } from "../../services/auth-service.js";
import { loadingHtml, emptyHtml, errorHtml, showToast, confirmDialog } from "../shared/ui-states.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const ROLE_LABELS = { admin: "إدمن", counselor: "مرشد", read_only: "قراءة فقط" };

function accountIdentifier(user) {
  const email = String(user?.email || "");
  return email.endsWith("@members.masar.local") ? email.split("@")[0] : email;
}

function openEditDialog(container, user) {
  const profile = user.profile || {};
  const dialog = document.createElement("dialog");
  dialog.className = "user-edit-dialog";
  dialog.setAttribute("aria-labelledby", "user-edit-title");
  dialog.innerHTML = `
    <form method="dialog" id="user-edit-form">
      <div class="user-edit-head">
        <div><h2 id="user-edit-title">تعديل بيانات المستخدم</h2><p>يُستخدم اسم المستخدم أو البريد الإلكتروني في تسجيل الدخول.</p></div>
        <button class="user-edit-close" type="button" aria-label="إغلاق">×</button>
      </div>
      <label class="user-edit-field">
        <span>الاسم الكامل</span>
        <input name="fullName" value="${esc(profile.full_name || "")}" required maxlength="120" autocomplete="name">
      </label>
      <label class="user-edit-field">
        <span>اسم المستخدم أو البريد الإلكتروني</span>
        <input name="identifier" value="${esc(accountIdentifier(user))}" required maxlength="254" dir="ltr" autocomplete="username">
        <small>يمكن استخدام اسم إنجليزي مثل m.ahmed أو بريد إلكتروني كامل.</small>
      </label>
      <div class="user-edit-actions">
        <button class="btn btn-ghost" type="button" data-edit-cancel>إلغاء</button>
        <button class="btn btn-primary" type="submit">حفظ التعديلات</button>
      </div>
    </form>`;
  document.body.append(dialog);

  const close = () => dialog.close();
  dialog.querySelector(".user-edit-close").addEventListener("click", close);
  dialog.querySelector("[data-edit-cancel]").addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.querySelector("#user-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const saveButton = form.querySelector("button[type='submit']");
    saveButton.disabled = true;
    try {
      const result = await updateAccount(user.id, {
        fullName: form.fullName.value,
        identifier: form.identifier.value,
      });
      showToast("تم تحديث بيانات المستخدم");
      close();
      if (result.self_updated) {
        window.setTimeout(() => window.location.reload(), 500);
        return;
      }
      await renderList(container);
    } catch (error) {
      showToast(error.message || "تعذّر تحديث بيانات المستخدم", { type: "error" });
      saveButton.disabled = false;
    }
  });

  dialog.showModal();
  dialog.querySelector("input[name='fullName']").focus();
}

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
      <thead><tr><th>الاسم</th><th>اسم المستخدم / البريد</th><th>الحالة</th><th>صلاحية</th><th><span class="sr-only">إجراءات</span></th></tr></thead>
      <tbody>
        ${users.map((u) => {
          const profile = u.profile || {};
          const active = profile.is_active !== false;
          const role = profile.role || (profile.is_admin ? "admin" : "counselor");
          return `
            <tr data-id="${esc(u.id)}">
              <td>${esc(profile.full_name || "—")}</td>
              <td dir="ltr">${esc(accountIdentifier(u) || "—")}</td>
              <td>${active ? '<span class="pill pill-success">نشط</span>' : '<span class="pill pill-critical">معطّل</span>'}</td>
              <td>
                <select data-action="role" aria-label="دور ${esc(profile.full_name || u.email || "المستخدم")}" style="padding:7px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:inherit;font-family:inherit;">
                  ${Object.entries(ROLE_LABELS).map(([value, label]) => `<option value="${value}"${role === value ? " selected" : ""}>${label}</option>`).join("")}
                </select>
              </td>
              <td>
                <div class="users-actions">
                  <button class="link-btn" data-action="edit">تعديل</button>
                  <button class="link-btn" data-action="toggle" data-active="${active}">${active ? "تعطيل" : "تفعيل"}</button>
                  <button class="link-btn" data-action="reset-password">إعادة تعيين كلمة المرور</button>
                </div>
              </td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;

  listRoot.querySelectorAll("[data-action='edit']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const user = users.find((item) => item.id === btn.closest("[data-id]").dataset.id);
      if (user) openEditDialog(container, user);
    });
  });

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
