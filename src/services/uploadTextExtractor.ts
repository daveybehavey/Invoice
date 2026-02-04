import pdfParse from "pdf-parse";

export type UploadedFile = {
  mimetype: string;
  buffer: Buffer;
};

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
