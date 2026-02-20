import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "I'm sorry, I couldn't generate an explanation right now.";
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
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error generating questions:", error);
    throw new Error("Failed to generate questions from PDF.");
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
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "Analysis unavailable.";
  } catch (error) {
    console.error("Error analyzing results:", error);
    return "Could not analyze results at this time.";
  }
}
