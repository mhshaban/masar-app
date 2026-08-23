const pendingScripts = new Map();

function absoluteAsset(path) {
  return new URL(path, document.baseURI).href;
}

function loadScript(path, globalName) {
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
  const src = absoluteAsset(path);
  if (pendingScripts.has(src)) return pendingScripts.get(src);

  const pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.masarVendor = globalName;
    script.addEventListener("load", () => {
      const loaded = globalThis[globalName];
      if (loaded) resolve(loaded);
      else reject(new Error(`اكتمل تحميل ${globalName} لكن المكتبة غير متاحة.`));
    }, { once: true });
    script.addEventListener("error", () => {
      pendingScripts.delete(src);
      script.remove();
      reject(new Error("تعذر تحميل أداة الاستيراد. تحقق من الاتصال ثم حاول مجددًا."));
    }, { once: true });
    document.head.append(script);
  });

  pendingScripts.set(src, pending);
  return pending;
}

export function ensureXlsx() {
  return loadScript("src/vendor/xlsx.core.min.js", "XLSX");
}

export async function ensurePdfJs() {
  const pdfjs = await loadScript("src/vendor/pdfjs/pdf.min.js", "pdfjsLib");
  pdfjs.GlobalWorkerOptions.workerSrc = absoluteAsset("src/vendor/pdfjs/pdf.worker.min.js");
  return pdfjs;
}
