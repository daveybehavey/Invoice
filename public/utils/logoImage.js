(() => {
  const MAX_LOGO_DIMENSION = 1400;

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string" && reader.result.length > 0) {
          resolve(reader.result);
          return;
        }
        reject(new Error("Unable to read file data."));
      };
      reader.onerror = () => reject(new Error("Unable to read file data."));
      reader.readAsDataURL(file);
    });

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to load image."));
      image.src = src;
    });

  const convertSvgDataUrlToPngDataUrl = async (svgDataUrl) => {
    const image = await loadImage(svgDataUrl);
    const sourceWidth = Number.isFinite(image.naturalWidth) && image.naturalWidth > 0 ? image.naturalWidth : 1200;
    const sourceHeight = Number.isFinite(image.naturalHeight) && image.naturalHeight > 0 ? image.naturalHeight : 400;
    const scale = Math.min(MAX_LOGO_DIMENSION / Math.max(sourceWidth, sourceHeight), 1);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context unavailable.");
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  };

  const isSvgFile = (file) => {
    if (!file) {
      return false;
    }
    const mime = typeof file.type === "string" ? file.type.toLowerCase() : "";
    const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
    return mime === "image/svg+xml" || name.endsWith(".svg");
  };

  const readLogoFileForStorage = async (file) => {
    const rawDataUrl = await readFileAsDataUrl(file);
    if (!isSvgFile(file)) {
      return { dataUrl: rawDataUrl, convertedFromSvg: false };
    }
    const pngDataUrl = await convertSvgDataUrlToPngDataUrl(rawDataUrl);
    return { dataUrl: pngDataUrl, convertedFromSvg: true };
  };

  window.InvoiceLogoImage = {
    readLogoFileForStorage
  };
})();
