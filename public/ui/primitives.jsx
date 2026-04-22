(() => {
  const cardBase =
    "w-full text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6993d2]/30 active:scale-[0.99]";

  function SparklesIcon({ className }) {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-2.846-2.846L2.5 12l2.846-.813a4.5 4.5 0 002.846-2.846L9 5.25l.813 2.846a4.5 4.5 0 002.846 2.846L15.5 12l-2.846.813a4.5 4.5 0 00-2.846 2.846zM18 16.5l.546 1.91a1.5 1.5 0 001.044 1.044L21.5 20l-1.91.546a1.5 1.5 0 00-1.044 1.044L18 23.5l-.546-1.91a1.5 1.5 0 00-1.044-1.044L14.5 20l1.91-.546a1.5 1.5 0 001.044-1.044L18 16.5z"
        />
      </svg>
    );
  }

  function PencilIcon({ className }) {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.862 4.487l1.687-1.687a1.875 1.875 0 112.652 2.652L6.75 19.903l-4.5 1.125 1.125-4.5L16.862 4.487z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 6l-2.25-2.25" />
      </svg>
    );
  }

  function UploadIcon({ className }) {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 6m0 0l4.5 4.5M12 6v10.5"
        />
      </svg>
    );
  }

  function ArchiveIcon({ className }) {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6.75h16.5M6.75 6.75V18a2.25 2.25 0 002.25 2.25h6a2.25 2.25 0 002.25-2.25V6.75M9 11.25h6"
        />
      </svg>
    );
  }

  function SwatchIcon({ className }) {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 7.5A3 3 0 017.5 4.5h5.379a3 3 0 012.121.879l3.621 3.621a3 3 0 010 4.243l-2.757 2.757a3 3 0 01-4.243 0L4.5 8.879V7.5z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 8.25h.008v.008H8.25V8.25z" />
      </svg>
    );
  }

  function FeedbackIcon({ className }) {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 12.75h6.75M8.625 9.75h6.75M5.25 4.5h13.5A2.25 2.25 0 0121 6.75v8.25a2.25 2.25 0 01-2.25 2.25H10.5L5.25 21v-3.75A2.25 2.25 0 013 15V6.75A2.25 2.25 0 015.25 4.5z"
        />
      </svg>
    );
  }

  function LauncherCard({ title, description, icon, onClick, disabled, badge }) {
    const iconClass = disabled ? "h-6 w-6 text-slate-400" : "h-6 w-6 text-[#093064]";
    return (
      <button
        type="button"
        className={`${cardBase} ${
          disabled
            ? "nb-surface cursor-not-allowed opacity-70"
            : "nb-surface nb-surface--elevated rounded-[30px] hover:-translate-y-0.5"
        }`}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-disabled={disabled}
      >
        <div className="flex items-start justify-between gap-4">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-[18px] ${
              disabled ? "bg-slate-100" : "bg-[#e8f0fb]"
            }`}
          >
            {React.cloneElement(icon, { className: iconClass })}
          </div>
          <div className="min-w-0 flex-1 space-y-1 text-left">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
                {title}
              </h2>
              {badge ? (
                <span className="nb-chip border-0 bg-[#093064] px-2 py-0.5 text-[10px] text-white">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="max-w-md text-sm text-slate-600">{description}</p>
          </div>
          {!disabled ? (
            <div className="mt-0.5 hidden rounded-full border border-[#6993d2]/18 bg-white/82 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#093064] sm:block">
              Open
            </div>
          ) : null}
        </div>
      </button>
    );
  }

  function SurfacePanel({ className = "", muted = false, elevated = false, children, ...props }) {
    const toneClass = elevated ? "nb-surface nb-surface--elevated" : muted ? "nb-surface nb-surface--muted" : "nb-surface";
    return (
      <section className={`${toneClass} ${className}`.trim()} {...props}>
        {children}
      </section>
    );
  }

  function StatusChip({ children, className = "", tone = "default" }) {
    const toneClass =
      tone === "success"
        ? "nb-chip nb-chip--success"
        : tone === "warning"
          ? "nb-chip nb-chip--warning"
          : tone === "danger"
            ? "nb-chip nb-chip--danger"
            : tone === "soft"
              ? "nb-chip nb-chip--soft"
              : "nb-chip";
    return <span className={`${toneClass} ${className}`.trim()}>{children}</span>;
  }

  window.InvoiceUIPrimitives = {
    cardBase,
    SparklesIcon,
    PencilIcon,
    UploadIcon,
    ArchiveIcon,
    SwatchIcon,
    FeedbackIcon,
    LauncherCard,
    SurfacePanel,
    StatusChip
  };
})();
