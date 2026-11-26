import React, { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import type { JobPhoto } from "../lib/types";

async function compressPhotoToJpegDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image file."));
      img.onload = () => {
        const maxDim = 900;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unavailable."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function PhotoProofUploader({
  photos,
  onChange
}: {
  photos: JobPhoto[];
  onChange: (next: JobPhoto[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, 4 - photos.length));
    e.target.value = "";
    if (files.length === 0) return;

    setBusy(true);
    try {
      const added: JobPhoto[] = [];
      for (const file of files) {
        const dataUrl = await compressPhotoToJpegDataUrl(file);
        added.push({
          id: `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          dataUrl,
          stage: photos.length + added.length === 0 ? "before" : "after",
          caption: ""
        });
      }
      onChange([...photos, ...added].slice(0, 4));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#47554E]">
          Attach Before/After work photos (up to 4) — shown on PDF & Client Portal.
        </span>
        {photos.length < 4 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5132] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#146C43] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            <span>Add Photo</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void handleSelect(e)}
        />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {photos.map((photo) => (
            <div key={photo.id} className="rounded-xl border border-[#E2E7E3] bg-white p-2.5">
              <div className="relative">
                <img
                  src={photo.dataUrl}
                  alt={photo.caption || "Job site proof"}
                  className="h-28 w-full rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => onChange(photos.filter((p) => p.id !== photo.id))}
                  aria-label="Remove photo"
                  className="absolute right-1.5 top-1.5 rounded-lg bg-black/65 p-1 text-white hover:bg-[#9F1239]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex gap-1.5">
                <select
                  value={photo.stage || "after"}
                  onChange={(e) =>
                    onChange(
                      photos.map((p) =>
                        p.id === photo.id
                          ? { ...p, stage: e.target.value as "before" | "after" | "progress" }
                          : p
                      )
                    )
                  }
                  className="rounded-lg border border-[#D9E0DC] bg-[#F5F6F2] px-2 py-1 text-[11px] font-semibold"
                >
                  <option value="before">Before</option>
                  <option value="after">After</option>
                  <option value="progress">Progress</option>
                </select>
                <input
                  type="text"
                  value={photo.caption || ""}
                  onChange={(e) =>
                    onChange(
                      photos.map((p) => (p.id === photo.id ? { ...p, caption: e.target.value } : p))
                    )
                  }
                  placeholder="Caption (optional)"
                  className="min-w-0 flex-1 rounded-lg border border-[#D9E0DC] px-2 py-1 text-xs outline-none focus:border-[#0F5132]"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
