(() => {
  const DEFAULT_ACCENT_COLOR = "#0f9d6e";

  const normalizeAccentColor = (value) => {
    const raw = typeof value === "string" ? value.trim() : "";
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `#${hex.toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const expanded = hex
        .split("")
        .map((char) => `${char}${char}`)
        .join("");
      return `#${expanded.toLowerCase()}`;
    }
    return DEFAULT_ACCENT_COLOR;
  };

  const hexToRgb = (hexColor) => {
    const normalized = normalizeAccentColor(hexColor).slice(1);
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16)
    };
  };

  const buildAccentPalette = (hexColor) => {
    const normalized = normalizeAccentColor(hexColor);
    const { r, g, b } = hexToRgb(normalized);
    return {
      primary: normalized,
      soft: `rgba(${r}, ${g}, ${b}, 0.12)`,
      border: `rgba(${r}, ${g}, ${b}, 0.35)`,
      muted: `rgba(${r}, ${g}, ${b}, 0.18)`,
      text: `rgba(${r}, ${g}, ${b}, 0.92)`
    };
  };

  window.InvoiceBrandTheme = {
    DEFAULT_ACCENT_COLOR,
    normalizeAccentColor,
    hexToRgb,
    buildAccentPalette
  };
})();
