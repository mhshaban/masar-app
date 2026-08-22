// حالات واجهة مشتركة (تحميل/فراغ/خطأ/نجاح/تأكيد) — بدل تكرار نفس الأنماط
// بكل شاشة على حدة. الأربعة الأولى نصوص HTML جاهزة للحقن مباشرة (تطابق
// أسلوب البناء الحالي بكل *-ui.js عبر innerHTML)، والأخيرتان (toast/تأكيد)
// دوال فعلية لأنهما تحتاجان مؤقّتًا/تفاعلًا.

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// جارٍ التحميل — role="status" حتى يُعلَن تلقائيًا لقارئ الشاشة بدون مقاطعة.
export function loadingHtml(message = "جارٍ التحميل…") {
  return `<div class="empty" role="status" aria-live="polite">${esc(message)}</div>`;
}

// لا بيانات بعد (وليس خطأ) — نفس صنف "empty" الحالي حتى لا يتغيّر أي شكل.
export function emptyHtml(message) {
  return `<div class="empty" role="status">${esc(message)}</div>`;
}

// فشل تحميل/عملية — role="alert" لأنها تستدعي انتباه المستخدم فورًا،
// بخلاف التحميل/الفراغ. إضافة زر "إعادة المحاولة" اختيارية عبر retryId.
export function errorHtml(message, { retryId } = {}) {
  return `
    <div class="empty" role="alert" style="color:var(--critical);">
      <div>${esc(message)}</div>
      ${retryId ? `<button type="button" class="btn btn-ghost" id="${esc(retryId)}" style="margin-top:10px;">إعادة المحاولة</button>` : ""}
    </div>
  `;
}

let toastRegion = null;
function getToastRegion() {
  if (toastRegion && document.body.contains(toastRegion)) return toastRegion;
  toastRegion = document.createElement("div");
  toastRegion.className = "toast-region";
  toastRegion.setAttribute("aria-live", "polite");
  toastRegion.setAttribute("aria-atomic", "true");
  document.body.appendChild(toastRegion);
  return toastRegion;
}

// إشعار عابر (نجاح/خطأ) بدل alert() الحاجب — يُعلَن لقارئ الشاشة عبر
// aria-live، ويختفي تلقائيًا، ويبقى قابلًا للإغلاق يدويًا.
export function showToast(message, { type = "success", duration = 4000 } = {}) {
  const region = getToastRegion();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${type === "error" ? "⚠" : "✓"}</span>
    <span class="toast-text">${esc(message)}</span>
    <button type="button" class="toast-close" aria-label="إغلاق الإشعار">×</button>
  `;
  region.appendChild(toast);
  const remove = () => toast.remove();
  const timer = setTimeout(remove, duration);
  toast.querySelector(".toast-close").addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
}

// تأكيد قبل عملية حساسة (حذف/استبدال نسخة احتياطية...) — نقطة واحدة
// مشتركة بدل نداء confirm() مباشر بكل ملف. يستخدم confirm() الأصلي للمتصفح
// حاليًا لأنه مضبوط أصلًا للعمل بلوحة المفاتيح ويُعلَن تلقائيًا لقارئ الشاشة
// دون أي كود إضافي؛ إبقاؤه هنا خلف دالة واحدة يحقق هدف "لا تكرار منطق
// التأكيد" ويسمح لاحقًا باستبداله بنافذة مصمَّمة دون تغيير أي نداء له.
export function confirmDialog(message) {
  return window.confirm(message);
}
