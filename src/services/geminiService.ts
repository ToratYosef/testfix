import { GoogleGenAI, Type } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const PRIMARY_MODEL = "gemini-3-flash-preview";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_STATUS_TEXT = new Set([
  "UNAVAILABLE",
  "RESOURCE_EXHAUSTED",
  "INTERNAL",
  "DEADLINE_EXCEEDED",
]);

function getAIClient(): GoogleGenAI {
  if (!apiKey) {
    throw new Error("Missing Gemini API key. Set VITE_GEMINI_API_KEY.");
  }

  return new GoogleGenAI({ apiKey });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseErrorPayload(error: unknown): { code?: number; status?: string; message?: string } {
  if (!(error instanceof Error) || !error.message) {
    return {};
  }

  try {
    const parsed = JSON.parse(error.message);
    if (parsed?.error && typeof parsed.error === "object") {
      return {
        code: typeof parsed.error.code === "number" ? parsed.error.code : undefined,
        status: typeof parsed.error.status === "string" ? parsed.error.status : undefined,
        message: typeof parsed.error.message === "string" ? parsed.error.message : undefined,
      };
    }
  } catch {
    // Non-JSON error message.
  }

  return {
    message: error.message,
  };
}

function isRetryableError(error: unknown): boolean {
  const { code, status, message } = parseErrorPayload(error);
  const normalizedStatus = status?.toUpperCase();

  if (typeof code === "number" && RETRYABLE_STATUS_CODES.has(code)) {
    return true;
  }

  if (normalizedStatus && RETRYABLE_STATUS_TEXT.has(normalizedStatus)) {
    return true;
  }

  const text = message ?? (error instanceof Error ? error.message : "");
  return /\b(503|429|unavailable|high demand|try again later|resource exhausted)\b/i.test(text);
}

async function generateWithResilience(params: {
  contents: string;
  config?: {
    responseMimeType?: string;
    responseSchema?: unknown;
  };
}): Promise<string> {
  const ai = getAIClient();
  const models = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          ...(params.config ? { config: params.config } : {}),
        });

        return response.text || "";
      } catch (error) {
        lastError = error;
        const shouldRetry = isRetryableError(error);
        const isLastAttemptForModel = attempt === 2;

        if (!shouldRetry || isLastAttemptForModel) {
          break;
        }

        const backoffMs = 600 * 2 ** attempt + Math.floor(Math.random() * 200);
        await delay(backoffMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini API request failed.");
}

export interface Question {
  topic: string;
  q: string;
  a: string[];
  correct: number;
}

export interface UserResult {
  question: Question;
  selectedIdx: number | null; // null if skipped
  isCorrect: boolean;
}

export interface ExplanationParams {
  question: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  topic: string;
}

export async function getAIExplanation(params: ExplanationParams): Promise<string> {
  const { question, selectedAnswer, correctAnswer, isCorrect, topic } = params;

  const prompt = `
    You are a subject matter expert. Provide a 1-2 sentence technical explanation for this quiz question.
    
    Topic: ${topic}
    Question: ${question}
    Student selected: ${selectedAnswer || "Skipped"}
    Correct answer: ${correctAnswer}
    Result: ${isCorrect ? "Correct" : "Incorrect"}
    
    Rules:
    - DO NOT say "Good job", "Spot on", "Correct", or any praise.
    - DO NOT repeat the question or the answer text unnecessarily.
    - Provide ONLY the scientific/technical explanation of why the correct answer is right and why the other might be wrong.
    - Max 2 sentences.
  `;

  try {
    const text = await generateWithResilience({ contents: prompt });
    return text || "I'm sorry, I couldn't generate an explanation right now.";
  } catch (error) {
    console.error("Error generating AI explanation:", error);
    return "The AI is currently unavailable. The correct answer is: " + correctAnswer;
  }
}

export async function generateQuestionsFromPDF(pdfText: string, count: number): Promise<Question[]> {
  const prompt = `
    Based on the following text extracted from a PDF, generate ${count} multiple-choice questions.
    Each question must have exactly 4 options and 1 correct answer.
    
    Text:
    ${pdfText.substring(0, 15000)} // Limit text size for prompt
  `;

  try {
    const text = await generateWithResilience({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING, description: "The specific topic or sub-heading of the question" },
              q: { type: Type.STRING, description: "The question text" },
              a: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of 4 possible answers"
              },
              correct: { type: Type.INTEGER, description: "The 0-based index of the correct answer in the 'a' array" }
            },
            required: ["topic", "q", "a", "correct"]
          }
        }
      }
    });

    return JSON.parse(text || "[]");
  } catch (error) {
    console.error("Error generating questions:", error);
    if (isRetryableError(error)) {
      throw new Error("Gemini is temporarily busy. Please retry in a few seconds.");
    }

    const { message } = parseErrorPayload(error);
    throw new Error(message || "Failed to generate questions from PDF.");
  }
}

export async function analyzeResults(results: UserResult[]): Promise<string> {
  const summary = results.map(r => ({
    topic: r.question.topic,
    isCorrect: r.isCorrect,
    skipped: r.selectedIdx === null
  }));

  const prompt = `
    Analyze these quiz results and provide a 2-3 sentence summary of the student's performance.
    Identify which topics they are struggling with and why (based on common misconceptions in those areas).
    
    Results:
    ${JSON.stringify(summary)}
    
    Rules:
    - Be direct and technical.
    - No praise.
    - Focus on identifying patterns in errors.
  `;

  try {
    const text = await generateWithResilience({ contents: prompt });
    return text || "Analysis unavailable.";
  } catch (error) {
    console.error("Error analyzing results:", error);
    return "Could not analyze results at this time.";
  }
}
