(() => {
  const cardBase =
    "w-full rounded-xl border bg-white p-5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 active:scale-[0.99]";

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

  function LauncherCard({ title, description, icon, onClick, disabled, badge }) {
    const iconClass = disabled ? "h-6 w-6 text-slate-400" : "h-6 w-6 text-blue-800";
    return (
      <button
        type="button"
        className={`${cardBase} ${
          disabled ? "cursor-not-allowed border-slate-200 bg-slate-50" : "border-slate-200"
        }`}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-disabled={disabled}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-lg ${
              disabled ? "bg-slate-100" : "bg-blue-100"
            }`}
          >
            {React.cloneElement(icon, { className: iconClass })}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
              {badge ? (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-600">{description}</p>
          </div>
        </div>
      </button>
    );
  }

  window.InvoiceUIPrimitives = {
    cardBase,
    SparklesIcon,
    PencilIcon,
    UploadIcon,
    ArchiveIcon,
    SwatchIcon,
    LauncherCard
  };
})();
