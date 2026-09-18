import { PasswordException, PDFParse } from "pdf-parse";

const PDF_WORKER_URL = `${import.meta.env.BASE_URL}assets/pdf.worker.mjs`;

let isWorkerConfigured = false;

function configureWorker() {
  if (isWorkerConfigured) return;

  PDFParse.setWorker(PDF_WORKER_URL);
  isWorkerConfigured = true;
}

interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

type PdfExtractionErrorCode = "password" | "unreadable";

class PdfExtractionError extends Error {
  readonly code: PdfExtractionErrorCode;

  constructor(
    code: PdfExtractionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PdfExtractionError";
    this.code = code;
  }
}

async function extractPdfPages(
  file: File,
  password?: string,
): Promise<ExtractedPdfPage[]> {
  let parser: PDFParse | undefined;

  try {
    configureWorker();
    parser = new PDFParse({
      data: new Uint8Array(await file.arrayBuffer()),
      password,
      // Partial extraction could silently omit Transactions.
      stopAtErrors: true,
    });
    const result = await parser.getText({ pageJoiner: "" });
    const pages = result.pages.map(({ num, text }) => ({
      pageNumber: num,
      text,
    }));

    if (!pages.some(({ text }) => text.trim().length > 0)) {
      throw new PdfExtractionError(
        "unreadable",
        `PDF file "${file.name}" does not contain extractable text.`,
      );
    }

    return pages;
  } catch (cause) {
    if (cause instanceof PdfExtractionError) throw cause;

    if (cause instanceof PasswordException) {
      throw new PdfExtractionError(
        "password",
        `Unable to unlock PDF file "${file.name}".`,
        { cause },
      );
    }

    throw new PdfExtractionError(
      "unreadable",
      `Unable to extract text from PDF file "${file.name}".`,
      { cause },
    );
  } finally {
    await parser?.destroy();
  }
}

export { extractPdfPages, PdfExtractionError };
export type { ExtractedPdfPage };
