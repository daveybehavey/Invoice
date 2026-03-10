(() => {
  const STYLE_PRESETS = {
    default: {
      label: "Classic",
      textClass: "text-sm text-slate-800 font-['Manrope']",
      sectionGap: "space-y-6",
      shellClass:
        "border-slate-200 bg-gradient-to-b from-white via-white to-slate-50/70 shadow-[0_22px_55px_-36px_rgba(15,23,42,0.45)]",
      metaClass: "text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400",
      titleClass: "text-3xl font-['Fraunces'] tracking-[0.12em] text-slate-900",
      labelClass: "text-slate-700 font-semibold",
      inputClass:
        "rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-[inset_0_1px_1px_rgba(15,23,42,0.05)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200",
      tableHeadClass: "text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500",
      totalsMutedClass: "text-slate-600",
      totalsStrongClass: "text-slate-900"
    },
    compact: {
      label: "Minimal",
      textClass: "text-[13px] text-slate-700 font-['Sora']",
      sectionGap: "space-y-5",
      shellClass:
        "border-slate-100 bg-gradient-to-b from-white via-white to-slate-50/40 shadow-[0_16px_42px_-34px_rgba(15,23,42,0.42)]",
      metaClass: "text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400",
      titleClass: "text-2xl font-semibold tracking-tight text-slate-900",
      labelClass: "text-slate-600 font-medium",
      inputClass:
        "rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-[inset_0_1px_1px_rgba(15,23,42,0.05)] focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200",
      tableHeadClass: "text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400",
      totalsMutedClass: "text-slate-600",
      totalsStrongClass: "text-slate-900"
    },
    spacious: {
      label: "Bold",
      textClass: "text-sm text-slate-800 font-['Manrope']",
      sectionGap: "space-y-7",
      shellClass:
        "border-slate-200 bg-gradient-to-b from-white via-white to-slate-100/60 shadow-[0_26px_60px_-36px_rgba(15,23,42,0.5)]",
      metaClass: "text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500",
      titleClass: "text-3xl font-['Archivo_Black'] tracking-[0.22em] text-slate-900",
      labelClass: "text-slate-800 font-semibold",
      inputClass:
        "rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-[inset_0_1px_1px_rgba(15,23,42,0.06)] focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200",
      tableHeadClass: "text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500",
      totalsMutedClass: "text-slate-600",
      totalsStrongClass: "text-slate-900"
    }
  };

  const STYLE_OPTIONS = Object.entries(STYLE_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label
  }));

  const SPACING_DENSITY_PRESETS = {
    tight: {
      label: "Tighter",
      shellPaddingClass: "p-5",
      sectionGapClass: "space-y-5"
    },
    balanced: {
      label: "Standard",
      shellPaddingClass: "p-6",
      sectionGapClass: ""
    },
    airy: {
      label: "Airy",
      shellPaddingClass: "p-7",
      sectionGapClass: "space-y-8"
    }
  };

  const SPACING_DENSITY_OPTIONS = Object.entries(SPACING_DENSITY_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label
  }));

  const TEMPLATE_PREVIEWS = {
    default: {
      title: "bg-slate-900",
      rule: "bg-slate-200",
      row: "bg-slate-200",
      totals: "bg-slate-300",
      totalStrong: "bg-slate-900"
    },
    compact: {
      title: "bg-slate-400",
      rule: "bg-slate-200",
      row: "bg-slate-100",
      totals: "bg-slate-200",
      totalStrong: "bg-slate-500"
    },
    spacious: {
      title: "bg-slate-900",
      rule: "bg-slate-300",
      row: "bg-slate-200",
      totals: "bg-slate-300",
      totalStrong: "bg-slate-900"
    }
  };

  window.InvoiceManualStyleCatalog = {
    STYLE_PRESETS,
    STYLE_OPTIONS,
    TEMPLATE_PREVIEWS,
    SPACING_DENSITY_PRESETS,
    SPACING_DENSITY_OPTIONS
  };
})();
