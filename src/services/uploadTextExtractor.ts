import pdfParse from "pdf-parse";
import { runImageOcrTask } from "../ai/openaiClient.js";

export type UploadedFile = {
  mimetype: string;
  buffer: Buffer;
};

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

export type ImageOcrExtraction = {
  text: string;
  warnings: string[];
  confidence: "high" | "medium" | "low";
  confidenceReasons: OcrConfidenceReason[];
};

export type OcrConfidenceReason =
  | "short_text"
  | "very_low_word_count"
  | "replacement_characters"
  | "low_word_count"
  | "single_line_capture"
  | "external_warning";

export async function extractUploadedInvoiceText(file: UploadedFile): Promise<string> {
  if (!file.buffer.length) {
    throw new Error("Uploaded file is empty.");
  }

  if (file.mimetype === "application/pdf") {
    const parsed = await pdfParse(file.buffer);
    const text = parsed.text.trim();

    if (!text) {
      throw new Error("Could not extract text from the uploaded PDF.");
    }

    return text;
  }

  if (file.mimetype.startsWith("text/") || file.mimetype === "application/json") {
    const text = file.buffer.toString("utf8").trim();
    if (!text) {
      throw new Error("Uploaded text file is empty.");
    }
    return text;
  }

  throw new Error(`Unsupported file type: ${file.mimetype}. Upload PDF or text.`);
}

export async function extractUploadedImageText(file: UploadedFile): Promise<ImageOcrExtraction> {
  if (!file.buffer.length) {
    throw new Error("Uploaded file is empty.");
  }
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new Error(`Unsupported image type: ${file.mimetype}. Upload PNG, JPG, or WEBP.`);
  }
  const ocrResult = await runImageOcrTask({
    mimeType: file.mimetype,
    base64Data: file.buffer.toString("base64")
  });
  const text = ocrResult.extractedText.trim();
  if (!text) {
    throw new Error("Could not extract readable text from the uploaded image.");
  }
  const warnings = new Set<string>();
  const externalWarnings = (ocrResult.warnings ?? []).filter(
    (warning): warning is string => typeof warning === "string" && warning.trim().length > 0
  );
  const confidenceReasons = new Set<OcrConfidenceReason>();
  const lineCount = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
  if (text.length < 30) {
    warnings.add("Very little text detected. Review carefully.");
    confidenceReasons.add("short_text");
  }
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 6) {
    warnings.add("Low OCR confidence: only a small amount of text was readable.");
    confidenceReasons.add("very_low_word_count");
  }
  if (/[�]/.test(text)) {
    warnings.add("Some characters were unreadable.");
    confidenceReasons.add("replacement_characters");
  }
  const hasLowSignals =
    confidenceReasons.has("short_text") ||
    confidenceReasons.has("very_low_word_count") ||
    confidenceReasons.has("replacement_characters");
  if (!hasLowSignals && wordCount >= 6 && wordCount < 20) {
    warnings.add("Only a modest amount of text was detected. Verify key fields.");
    confidenceReasons.add("low_word_count");
  }
  if (!hasLowSignals && lineCount === 1 && wordCount >= 8) {
    warnings.add("OCR found one text line. Check for missed line breaks.");
    confidenceReasons.add("single_line_capture");
  }
  externalWarnings.forEach((warning) => {
    warnings.add(warning.trim());
    confidenceReasons.add("external_warning");
  });
  const confidence: ImageOcrExtraction["confidence"] =
    hasLowSignals ? "low" : externalWarnings.length > 0 || wordCount < 20 ? "medium" : "high";
  return {
    text,
    warnings: Array.from(warnings),
    confidence,
    confidenceReasons: Array.from(confidenceReasons)
  };
}
