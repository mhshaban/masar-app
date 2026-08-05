export function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = window.XLSX.read(data, { type: "array" });
        const sheets = {};
        for (const name of workbook.SheetNames) {
          sheets[name] = window.XLSX.utils.sheet_to_json(workbook.Sheets[name], {
            header: 1,
            defval: null,
            raw: true,
          });
        }
        resolve({ sheetNames: workbook.SheetNames, sheets });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
