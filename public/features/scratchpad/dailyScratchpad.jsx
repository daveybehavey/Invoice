(() => {
  const { useNavigate } = ReactRouterDOM;
  const { useEffect, useMemo, useRef, useState } = React;
  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /features/scratchpad/dailyScratchpad.jsx."
    );
  }

  const normalizeNoteText = (value) =>
    String(value ?? "")
      .replace(/\r\n/g, "\n")
      .trim();

  const formatTime = (value) => {
    const parsed = Date.parse(value ?? "");
    if (!Number.isFinite(parsed)) {
      return "just now";
    }
    return new Date(parsed).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  const formatSessionLabel = (value) => {
    const parsed = Date.parse(value ?? "");
    if (!Number.isFinite(parsed)) {
      return "Today";
    }
    const noteDate = new Date(parsed);
    const today = new Date();
    const sameDay =
      noteDate.getFullYear() === today.getFullYear() &&
      noteDate.getMonth() === today.getMonth() &&
      noteDate.getDate() === today.getDate();
    if (sameDay) {
      return "Today";
    }
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sameYesterday =
      noteDate.getFullYear() === yesterday.getFullYear() &&
      noteDate.getMonth() === yesterday.getMonth() &&
      noteDate.getDate() === yesterday.getDate();
    if (sameYesterday) {
      return "Yesterday";
    }
    return noteDate.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      weekday: "short"
    });
  };

  const readNotes = (storageKey) => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed
            .filter((item) => item && typeof item.text === "string")
            .map((item) => ({
              id: String(item.id ?? `note-${Date.now()}`),
              text: String(item.text ?? ""),
              createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
              tags: Array.isArray(item.tags)
                ? item.tags.map((tag) => normalizeNoteText(tag)).filter(Boolean).slice(0, 8)
                : []
            }))
        : [];
    } catch (_error) {
      return [];
    }
  };

  const writeNotes = (storageKey, notes) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(notes));
    } catch (_error) {
      // Best-effort only.
    }
  };

  const trackRevenueSignal = (event, source) => {
    void requestIdentity.apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        source
      })
    }).catch(() => {});
  };

  const buildDraftFromNote = (noteText) => ({
    invoiceNumber: "INV-0001",
    invoiceDate: "",
    dueDate: "",
    fromDetails: "",
    billToDetails: "",
    notes: noteText,
    paymentLinkUrl: "",
    taxRate: "0",
    discountAmount: "0",
    lineItems: [{ id: "line-1", description: "", qty: "", rate: "" }],
    logoUrl: null,
    logoVisible: true,
    notesVisible: true,
    headerLayout: "split",
    spacingDensity: "balanced",
    stylePreset: "default",
    accentColor: "#6993d2",
    savedInvoiceId: "",
    savedInvoiceStatus: ""
  });

  const buildCombinedNoteText = (selectedNotes) =>
    selectedNotes
      .map((note) => {
        const parts = [`${formatSessionLabel(note.createdAt)}`];
        if (Array.isArray(note.tags) && note.tags.length > 0) {
          parts.push(`Tags: ${note.tags.map((tag) => `#${tag}`).join(", ")}`);
        }
        parts.push(note.text);
        return parts.join("\n");
      })
      .join("\n\n");

  function DailyScratchpadPage() {
    const navigate = useNavigate();
    const draftStorageKey =
      requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? "invoiceDraft";
    const scratchpadSeedStorageKey =
      requestIdentity.getScopedStorageKey?.("invoiceScratchpadSeed") ?? "invoiceScratchpadSeed";
    const scratchpadStorageKey =
      requestIdentity.getScopedStorageKey?.("invoiceScratchpad") ?? "invoiceScratchpad";
    const voiceUploadInputRef = useRef(null);
    const [noteText, setNoteText] = useState("");
    const [tagText, setTagText] = useState("");
    const [notes, setNotes] = useState(() => readNotes(scratchpadStorageKey));
    const [status, setStatus] = useState("");
    const [voiceNoteBusy, setVoiceNoteBusy] = useState(false);
    const [voiceNoteError, setVoiceNoteError] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [busyId, setBusyId] = useState("");
    const [activeTagFilter, setActiveTagFilter] = useState("");
    const [selectedNoteIds, setSelectedNoteIds] = useState([]);
    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const discardRecordingResultRef = useRef(false);

    useEffect(() => {
      setNotes(readNotes(scratchpadStorageKey));
    }, [scratchpadStorageKey]);

    useEffect(() => {
      setSelectedNoteIds((current) => current.filter((id) => notes.some((note) => note.id === id)));
    }, [notes]);

    useEffect(
      () => () => {
        discardRecordingResultRef.current = true;
        try {
          mediaRecorderRef.current?.stop?.();
        } catch (_error) {
          // Ignore recorder shutdown errors on page teardown.
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
      },
      []
    );

    const tagList = (value) =>
      String(value ?? "")
        .split(",")
        .map((tag) => normalizeNoteText(tag))
        .filter(Boolean)
        .slice(0, 8);

    const noteMatchesFilter = (note, filter) => {
      if (!filter) {
        return true;
      }
      return Array.isArray(note?.tags) && note.tags.some((tag) => tag.toLowerCase() === filter.toLowerCase());
    };

    const visibleNotes = notes.filter((note) => noteMatchesFilter(note, activeTagFilter));
    const latestNote = visibleNotes[0] ?? notes[0] ?? null;
    const groupedVisibleNotes = useMemo(() => {
      const groups = [];
      visibleNotes.forEach((note) => {
        const label = formatSessionLabel(note.createdAt);
        const existing = groups.find((group) => group.label === label);
        if (existing) {
          existing.notes.push(note);
          return;
        }
        groups.push({ label, notes: [note] });
      });
      return groups;
    }, [visibleNotes]);
    const selectedVisibleNotes = useMemo(
      () => visibleNotes.filter((note) => selectedNoteIds.includes(note.id)),
      [selectedNoteIds, visibleNotes]
    );
    const multiNoteSelectionLabel =
      selectedVisibleNotes.length > 1
        ? `${selectedVisibleNotes.length} selected notes ready to convert`
        : selectedVisibleNotes.length === 1
          ? "1 selected note ready to convert"
          : "";
    const noteCountLabel = useMemo(() => {
      const savedLabel = `${notes.length} saved note${notes.length === 1 ? "" : "s"}`;
      if (!activeTagFilter) {
        return savedLabel;
      }
      return `${visibleNotes.length} shown of ${savedLabel}`;
    }, [activeTagFilter, notes.length, visibleNotes.length]);
    const allTags = useMemo(
      () =>
        Array.from(new Set(notes.flatMap((note) => (Array.isArray(note.tags) ? note.tags : [])))).sort((left, right) =>
          left.localeCompare(right)
        ),
      [notes]
    );

    const flashStatus = (message) => {
      setStatus(message);
      window.setTimeout(() => setStatus(""), 1800);
    };

    const persistNotes = (nextNotes) => {
      const trimmed = nextNotes.slice(0, 30);
      setNotes(trimmed);
      writeNotes(scratchpadStorageKey, trimmed);
    };

    const transcribeAudioFile = async (file, sourceLabel) => {
      setVoiceNoteBusy(true);
      setVoiceNoteError("");
      try {
        const formData = new FormData();
        formData.append("audioFile", file);
        const response = await requestIdentity.apiFetch("/api/invoices/transcribe-audio", {
          method: "POST",
          body: formData
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || `Could not transcribe ${sourceLabel}.`);
        }
        const transcript =
          typeof payload?.extractedText === "string" ? normalizeNoteText(payload.extractedText) : "";
        if (!transcript) {
          throw new Error("No transcript returned for that voice note.");
        }
        setNoteText((current) => {
          const existing = normalizeNoteText(current);
          return existing ? `${existing}\n\n${transcript}` : transcript;
        });
        trackRevenueSignal("scratchpad_voice_note_transcribed", "scratchpad_voice_upload");
        flashStatus(`Added transcript from ${sourceLabel}. Review it, then save the note.`);
      } finally {
        setVoiceNoteBusy(false);
      }
    };

    const handleSaveNote = () => {
      const text = normalizeNoteText(noteText);
      if (!text) {
        flashStatus("Type a note first.");
        return;
      }
      const tags = tagList(tagText);
      const nextNotes = [
        {
          id: `note-${Date.now()}`,
          text,
          createdAt: new Date().toISOString(),
          tags
        },
        ...notes.filter((item) => item.text !== text || JSON.stringify(item.tags ?? []) !== JSON.stringify(tags))
      ];
      persistNotes(nextNotes);
      setNoteText("");
      setTagText("");
      trackRevenueSignal("scratchpad_note_saved", "scratchpad_save");
      flashStatus("Saved to today's scratchpad.");
    };

    const triggerVoiceNoteUpload = () => {
      voiceUploadInputRef.current?.click();
    };

    const handleVoiceNoteSelected = async (event) => {
      const file = event?.target?.files?.[0];
      if (!file) {
        return;
      }
      try {
        await transcribeAudioFile(file, file.name);
      } catch (error) {
        setVoiceNoteError(error?.message || "Could not transcribe that voice note.");
      } finally {
        if (event?.target) {
          event.target.value = "";
        }
      }
    };

    const startVoiceRecording = async () => {
      if (isRecording || voiceNoteBusy) {
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder !== "function") {
        flashStatus("Voice recording is not supported in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new window.MediaRecorder(stream);
        recordedChunksRef.current = [];
        mediaStreamRef.current = stream;
        mediaRecorderRef.current = recorder;
        discardRecordingResultRef.current = false;
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };
        recorder.onstop = async () => {
          const discardResult = discardRecordingResultRef.current;
          const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          recordedChunksRef.current = [];
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
          }
          mediaRecorderRef.current = null;
          setIsRecording(false);
          if (discardResult) {
            discardRecordingResultRef.current = false;
            return;
          }
          if (blob.size === 0) {
            flashStatus("Voice memo was empty.");
            return;
          }
          const file = new File([blob], `scratchpad-voice-memo-${Date.now()}.webm`, {
            type: blob.type || "audio/webm"
          });
          await transcribeAudioFile(file, "voice memo");
        };
        recorder.start();
        setIsRecording(true);
        flashStatus("Recording voice memo...");
      } catch (error) {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setVoiceNoteError(error?.message || "Could not start voice recording.");
      }
    };

    const stopVoiceRecording = () => {
      if (!mediaRecorderRef.current || !isRecording) {
        return;
      }
      try {
        discardRecordingResultRef.current = false;
        mediaRecorderRef.current.stop();
      } catch (_error) {
        setIsRecording(false);
      }
    };

    const handleDeleteNote = (id) => {
      persistNotes(notes.filter((note) => note.id !== id));
      flashStatus("Deleted note.");
    };

    const handleToggleFilter = (tag) => {
      setActiveTagFilter((current) => (current.toLowerCase() === tag.toLowerCase() ? "" : tag));
    };

    const toggleNoteSelection = (noteId) => {
      setSelectedNoteIds((current) =>
        current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId]
      );
    };

    const selectVisibleNotes = () => {
      setSelectedNoteIds(visibleNotes.map((note) => note.id));
    };

    const clearSelectedNotes = () => {
      setSelectedNoteIds([]);
    };

    const handleUseNote = (note) => {
      if (!note?.text) {
        return;
      }
      setBusyId(note.id);
      try {
        trackRevenueSignal("scratchpad_note_used_in_invoice", "scratchpad_invoice_start");
        window.localStorage.setItem(draftStorageKey, JSON.stringify(buildDraftFromNote(note.text)));
        flashStatus("Loaded into invoice draft.");
        navigate("/manual");
      } finally {
        setBusyId("");
      }
    };

    const handleUseLatest = () => {
      if (latestNote) {
        handleUseNote(latestNote);
      }
    };

    const handleUseSelectedNotes = () => {
      if (selectedVisibleNotes.length === 0) {
        flashStatus("Select one or more notes first.");
        return;
      }
      setBusyId("selected-notes");
      try {
        trackRevenueSignal("scratchpad_note_used_in_invoice", "scratchpad_invoice_start");
        window.localStorage.setItem(
          draftStorageKey,
          JSON.stringify(buildDraftFromNote(buildCombinedNoteText(selectedVisibleNotes)))
        );
        flashStatus(`Loaded ${selectedVisibleNotes.length} notes into invoice draft.`);
        navigate("/manual");
      } finally {
        setBusyId("");
      }
    };

    const handleUseNoteWithBillie = (note) => {
      if (!note?.text) {
        return;
      }
      setBusyId(note.id);
      try {
        const seed = {
          text: note.text,
          tags: Array.isArray(note.tags) ? note.tags : [],
          createdAt: note.createdAt || new Date().toISOString()
        };
        window.localStorage.setItem(scratchpadSeedStorageKey, JSON.stringify(seed));
        trackRevenueSignal("scratchpad_note_used_in_invoice", "scratchpad_billie_start");
        flashStatus("Loaded into Billie intake.");
        navigate("/ai-intake");
      } finally {
        setBusyId("");
      }
    };

    const handleUseSelectedNotesWithBillie = () => {
      if (selectedVisibleNotes.length === 0) {
        flashStatus("Select one or more notes first.");
        return;
      }
      setBusyId("selected-notes-billie");
      try {
        const tags = Array.from(
          new Set(selectedVisibleNotes.flatMap((note) => (Array.isArray(note.tags) ? note.tags : [])))
        ).slice(0, 8);
        const seed = {
          text: buildCombinedNoteText(selectedVisibleNotes),
          tags,
          createdAt: selectedVisibleNotes[0]?.createdAt || new Date().toISOString()
        };
        window.localStorage.setItem(scratchpadSeedStorageKey, JSON.stringify(seed));
        trackRevenueSignal("scratchpad_note_used_in_invoice", "scratchpad_billie_start");
        flashStatus(`Loaded ${selectedVisibleNotes.length} notes into Billie intake.`);
        navigate("/ai-intake");
      } finally {
        setBusyId("");
      }
    };

    const handleClearAll = () => {
      persistNotes([]);
      flashStatus("Cleared scratchpad.");
    };

    return (
      <div className="nb-page min-h-screen bg-gradient-to-b from-[#f8fbff] to-[#edf3fb] text-slate-900">
        <main className="nb-page-shell nb-page-shell--medium max-w-4xl py-8 md:py-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6993d2]">
                Daily scratchpad
              </p>
              <h1 className="mt-2 text-3xl text-slate-900 md:text-5xl" style={{ fontFamily: "'Fraunces', serif" }}>
                Capture work fast. Invoice later.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                Keep a running note during the day, then turn any note into a draft invoice when you&apos;re ready.
              </p>
            </div>
            <button
              type="button"
              className="nb-btn-secondary rounded-full px-4 py-2"
              onClick={() => navigate("/")}
            >
              Back to launcher
            </button>
          </div>

          <section className="nb-surface nb-surface--elevated mt-6 rounded-[32px] p-4 md:p-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="scratchpad-note">
                  New note
                </label>
                <textarea
                  id="scratchpad-note"
                  rows={7}
                  className="nb-input min-h-[180px] w-full rounded-[24px] px-4 py-3 text-base leading-6"
                  placeholder="Quick job note, materials, time, client detail, or anything you might invoice later..."
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                />
                <input
                  type="text"
                  className="nb-input w-full rounded-[24px] px-4 py-3 text-base"
                  placeholder="Tags, comma separated: client, job, materials"
                  value={tagText}
                  onChange={(event) => setTagText(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="nb-btn-primary rounded-full px-4 py-2"
                    onClick={handleSaveNote}
                  >
                    Save note
                  </button>
                  <button
                    type="button"
                    className="nb-btn-secondary rounded-full px-4 py-2 disabled:opacity-60"
                    onClick={triggerVoiceNoteUpload}
                    disabled={voiceNoteBusy}
                  >
                    {voiceNoteBusy ? "Transcribing..." : "Add voice note"}
                  </button>
                  <button
                    type="button"
                    className="nb-btn-secondary rounded-full px-4 py-2 disabled:opacity-60"
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    disabled={voiceNoteBusy}
                  >
                    {isRecording ? "Stop recording" : "Record voice memo"}
                  </button>
                  <button
                    type="button"
                    className="nb-btn-secondary rounded-full px-4 py-2 disabled:opacity-60"
                    onClick={handleUseLatest}
                    disabled={!latestNote}
                  >
                    Start invoice from latest note
                  </button>
                  <button
                    type="button"
                    className="nb-btn-secondary rounded-full px-4 py-2 disabled:opacity-60"
                    onClick={() => latestNote && handleUseNoteWithBillie(latestNote)}
                    disabled={!latestNote}
                  >
                    Open latest with Billie
                  </button>
                </div>
                <input
                  ref={voiceUploadInputRef}
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={handleVoiceNoteSelected}
                />
                <p className="text-xs text-slate-500">
                  Voice memos can be uploaded or recorded here, then transcribed into editable scratchpad text.
                </p>
                {status ? <p className="text-sm text-slate-600">{status}</p> : null}
                {voiceNoteError ? <p className="text-sm text-rose-600">{voiceNoteError}</p> : null}
              </div>

              <div className="rounded-[26px] border border-[#6993d2]/18 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6993d2]">Today</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{noteCountLabel}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  These notes stay on this device and can be moved into an invoice later.
                </p>
                {allTags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          activeTagFilter.toLowerCase() === tag.toLowerCase()
                            ? "bg-[#093064] text-white"
                            : "bg-[#edf3fb] text-[#093064]"
                        }`}
                        onClick={() => handleToggleFilter(tag)}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                ) : null}
                {selectedVisibleNotes.length > 0 ? (
                  <div className="mt-4 rounded-[22px] border border-[#6993d2]/18 bg-[#f6f9ff] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                      Selected notes
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{multiNoteSelectionLabel}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="nb-btn-primary rounded-full px-3 py-1.5 text-sm disabled:opacity-60"
                        onClick={handleUseSelectedNotes}
                        disabled={busyId === "selected-notes"}
                      >
                        {busyId === "selected-notes" ? "Opening..." : "Use selected in invoice"}
                      </button>
                      <button
                        type="button"
                        className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm disabled:opacity-60"
                        onClick={handleUseSelectedNotesWithBillie}
                        disabled={busyId === "selected-notes-billie"}
                      >
                        {busyId === "selected-notes-billie" ? "Opening..." : "Open selected with Billie"}
                      </button>
                      <button
                        type="button"
                        className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm"
                        onClick={clearSelectedNotes}
                      >
                        Clear selection
                      </button>
                    </div>
                  </div>
                ) : null}
                {latestNote ? (
                  <button
                    type="button"
                    className="nb-btn-secondary mt-4 rounded-full px-4 py-2"
                    onClick={() => handleUseNote(latestNote)}
                    disabled={busyId === latestNote.id}
                  >
                    {busyId === latestNote.id ? "Opening..." : "Use latest note"}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="nb-surface mt-5 rounded-[30px] p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6993d2]">Running notes</p>
                <p className="mt-1 text-sm text-slate-600">Tap any note to turn it into a draft invoice.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm"
                  onClick={selectVisibleNotes}
                  disabled={visibleNotes.length === 0}
                >
                  Select all shown
                </button>
                <button
                  type="button"
                  className="nb-btn-ghost rounded-full px-3 py-1.5 text-sm"
                  onClick={handleClearAll}
                  disabled={notes.length === 0}
                >
                  Clear all
                </button>
              </div>
            </div>

            {visibleNotes.length > 0 ? (
              <div className="mt-4 space-y-3">
                {groupedVisibleNotes.map((group) => (
                  <section key={group.label} className="rounded-[28px] border border-slate-200 bg-white/80 p-3 md:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                          {group.label}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {group.notes.length} note{group.notes.length === 1 ? "" : "s"} in this session
                        </p>
                      </div>
                      <button
                        type="button"
                        className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm"
                        onClick={() =>
                          setSelectedNoteIds((current) => {
                            const groupIds = group.notes.map((note) => note.id);
                            const allSelected = groupIds.every((id) => current.includes(id));
                            return allSelected
                              ? current.filter((id) => !groupIds.includes(id))
                              : Array.from(new Set([...current, ...groupIds]));
                          })
                        }
                      >
                        {group.notes.every((note) => selectedNoteIds.includes(note.id))
                          ? "Clear session selection"
                          : "Select session"}
                      </button>
                    </div>
                    <div className="mt-3 space-y-3">
                      {group.notes.map((note) => (
                        <article
                          key={note.id}
                          className={`rounded-[24px] border p-4 shadow-sm transition ${
                            selectedNoteIds.includes(note.id)
                              ? "border-[#6993d2]/35 bg-[#f6f9ff]"
                              : "border-slate-200 bg-slate-50/90"
                          }`}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-[#093064]"
                                  checked={selectedNoteIds.includes(note.id)}
                                  onChange={() => toggleNoteSelection(note.id)}
                                />
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  {formatTime(note.createdAt)}
                                </p>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{note.text}</p>
                              {Array.isArray(note.tags) && note.tags.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {note.tags.map((tag) => (
                                    <button
                                      key={`${note.id}:${tag}`}
                                      type="button"
                                      className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#093064] ring-1 ring-[#093064]/10"
                                      onClick={() => handleToggleFilter(tag)}
                                    >
                                      #{tag}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="nb-btn-primary rounded-full px-3 py-1.5 text-sm disabled:opacity-60"
                                onClick={() => handleUseNote(note)}
                                disabled={busyId === note.id}
                              >
                                {busyId === note.id ? "Opening..." : "Use in invoice"}
                              </button>
                              <button
                                type="button"
                                className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm disabled:opacity-60"
                                onClick={() => handleUseNoteWithBillie(note)}
                                disabled={busyId === note.id}
                              >
                                {busyId === note.id ? "Opening..." : "Open with Billie"}
                              </button>
                              <button
                                type="button"
                                className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm"
                                onClick={() => navigator.clipboard?.writeText(note.text).catch(() => {})}
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                className="nb-btn-ghost rounded-full px-3 py-1.5 text-sm"
                                onClick={() => handleDeleteNote(note.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[24px] border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-600">
                {activeTagFilter
                  ? `No notes tagged #${activeTagFilter} yet. Clear the filter or add a note with that tag.`
                  : "No notes yet. Save a quick thought and it will show up here."}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  window.InvoiceScratchpadPage = {
    DailyScratchpadPage
  };
})();
