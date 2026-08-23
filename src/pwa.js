const INSTALL_DISMISSED_KEY = "masar_install_prompt_dismissed";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const alternate = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return ios && webkit && !alternate;
}

function showUpdateNotice(registration) {
  if (document.querySelector("#pwa-update-notice")) return;
  const notice = document.createElement("div");
  notice.id = "pwa-update-notice";
  notice.className = "pwa-update-notice";
  notice.setAttribute("role", "status");
  notice.innerHTML = `
    <span>يتوفر تحديث جديد لمسار.</span>
    <button type="button" class="btn btn-primary">تحديث الآن</button>
  `;
  notice.querySelector("button").addEventListener("click", () => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  });
  document.body.append(notice);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  const registration = await navigator.serviceWorker.register(new URL("../sw.js", import.meta.url), { scope: "./" });
  if (registration.waiting && navigator.serviceWorker.controller) showUpdateNotice(registration);
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateNotice(registration);
    });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
}

function createInstallCard({ ios, installPrompt }) {
  if (isStandalone() || localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") return;
  if (!ios && !installPrompt) return;

  const card = document.createElement("aside");
  card.className = "install-card";
  card.setAttribute("aria-label", "تثبيت تطبيق مسار");
  card.innerHTML = `
    <button type="button" class="install-dismiss" aria-label="إخفاء اقتراح التثبيت">×</button>
    <strong>ثبّت مسار على جهازك</strong>
    <p>${ios ? "من Safari اضغط مشاركة، ثم اختر «إضافة إلى الشاشة الرئيسية»." : "افتح مسار كتطبيق مستقل من الشاشة الرئيسية."}</p>
    ${ios ? "" : '<button type="button" class="btn btn-primary install-action">تثبيت التطبيق</button>'}
  `;
  card.querySelector(".install-dismiss").addEventListener("click", () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    card.remove();
  });
  card.querySelector(".install-action")?.addEventListener("click", async () => {
    await installPrompt.prompt();
    await installPrompt.userChoice;
    card.remove();
  });
  document.body.append(card);
}

export function initPwa() {
  registerServiceWorker().catch(() => {});
  if (isStandalone()) document.documentElement.classList.add("standalone");

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    createInstallCard({ ios: false, installPrompt: deferredPrompt });
  });

  if (isIosSafari()) createInstallCard({ ios: true, installPrompt: null });
}
