/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Dna, 
  ChevronRight, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  BookOpen, 
  Sparkles,
  BrainCircuit,
  Trophy,
  Upload,
  FileJson,
  AlertCircle,
  ClipboardPaste,
  FileText,
  SkipForward,
  ChevronLeft,
  Search,
  History
} from 'lucide-react';
import { getAIExplanation, generateQuestionsFromPDF, analyzeResults, Question, UserResult } from './services/geminiService';
import * as pdfjs from 'pdfjs-dist';

// Import worker using Vite's ?url suffix for static asset path
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type Screen = 'START' | 'QUIZ' | 'END';

export default function App() {
  const SECRET_CODE = 'hannahfreue';

  const [quizData, setQuizData] = useState<Question[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const [screen, setScreen] = useState<Screen>('START');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [questionCount, setQuestionCount] = useState('');
  
  // Secret code state
  const [typedCode, setTypedCode] = useState('');
  const [showJsonModal, setShowJsonModal] = useState(false);

  // Results tracking
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  // Listen for secret code
  useEffect(() => {
    if (screen !== 'START') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.length !== 1) return;

      setTypedCode((previousCode) => {
        const newCode = (previousCode + e.key.toLowerCase()).slice(-SECRET_CODE.length);

        if (newCode.includes(SECRET_CODE)) {
          setShowJsonModal(true);
          return '';
        }

        return newCode;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen]);

  const currentQuestion = quizData[currentIndex];

  const validateAndSetData = (data: any) => {
    try {
      if (!Array.isArray(data)) throw new Error("JSON must be an array of questions");
      
      const isValid = data.every(q => 
        typeof q.topic === 'string' && 
        typeof q.q === 'string' && 
        Array.isArray(q.a) && 
        q.a.length > 0 &&
        typeof q.correct === 'number' &&
        q.correct >= 0 &&
        q.correct < q.a.length
      );

      if (!isValid) throw new Error("Invalid question format. Each question must have topic, q, a (non-empty array), and correct (valid index).");

      setQuizData(data);
      setUploadError(null);
      return true;
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Invalid data format");
      return false;
    }
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    return fullText;
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const parsedCount = Number(questionCount);
    if (!questionCount.trim() || !Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 20) {
      setUploadError('Please enter a question count between 1 and 500.');
      return;
    }

    setIsGenerating(true);
    setUploadError(null);
    try {
      const text = await extractTextFromPDF(file);
      const questions = await generateQuestionsFromPDF(text, parsedCount);
      setQuizData(questions);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to process PDF or generate questions.");
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        validateAndSetData(json);
      } catch (err) {
        setUploadError("Failed to parse JSON file");
      }
    };
    reader.readAsText(file);
  };

  const handlePasteApply = () => {
    try {
      const json = JSON.parse(jsonInput);
      validateAndSetData(json);
    } catch (err) {
      setUploadError("Failed to parse pasted JSON text");
    }
  };

  const handleStart = () => {
    if (quizData.length === 0) return;
    setScreen('QUIZ');
    setCurrentIndex(0);
    setScore(0);
    setSelectedIdx(null);
    setIsAnswered(false);
    setAiExplanation(null);
    setUserResults([]);
    setAiAnalysis(null);
    setReviewIndex(null);
  };

  const handleSelect = (idx: number) => {
    if (isAnswered) return;
    setSelectedIdx(idx);
    setIsAnswered(true);
    
    const isCorrect = idx === currentQuestion.correct;
    if (isCorrect) setScore(s => s + 1);

    // Record result
    const result: UserResult = {
      question: currentQuestion,
      selectedIdx: idx,
      isCorrect
    };
    setUserResults(prev => [...prev, result]);
  };

  const handleSkip = () => {
    if (isAnswered) return;
    
    // Record as skipped
    const result: UserResult = {
      question: currentQuestion,
      selectedIdx: null,
      isCorrect: false
    };
    setUserResults(prev => [...prev, result]);
    
    if (currentIndex < quizData.length - 1) {
      setCurrentIndex(c => c + 1);
      setSelectedIdx(null);
      setIsAnswered(false);
      setAiExplanation(null);
    } else {
      finishQuiz();
    }
  };

  const fetchExplanation = async (q: Question, sIdx: number | null) => {
    setIsLoadingAi(true);
    const explanation = await getAIExplanation({
      question: q.q,
      selectedAnswer: sIdx !== null ? q.a[sIdx] : "Skipped",
      correctAnswer: q.a[q.correct],
      isCorrect: sIdx === q.correct,
      topic: q.topic
    });
    setAiExplanation(explanation);
    setIsLoadingAi(false);
  };

  const handleNext = () => {
    if (currentIndex < quizData.length - 1) {
      setCurrentIndex(c => c + 1);
      setSelectedIdx(null);
      setIsAnswered(false);
      setAiExplanation(null);
    } else {
      finishQuiz();
    }
  };

  const finishQuiz = async () => {
    setScreen('END');
    setIsAnalyzing(true);
    // We need to make sure userResults is up to date. 
    // If the last question was answered/skipped, it's already in userResults.
    const analysis = await analyzeResults(userResults);
    setAiAnalysis(analysis);
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-neutral-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <BrainCircuit className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-800">Test <span className="text-indigo-600">Master</span></h1>
          </div>
          {screen === 'QUIZ' && (
            <div className="flex items-center gap-4">
              <div className="text-sm font-medium text-neutral-500">
                Question {currentIndex + 1} of {quizData.length}
              </div>
              <div className="h-2 w-32 bg-neutral-100 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-indigo-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentIndex + 1) / quizData.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {screen === 'START' && (
            <motion.div 
              key="start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-12"
            >
              <div className="space-y-4">
                <h2 className="text-5xl font-extrabold tracking-tight text-neutral-900 leading-tight">
                  The Ultimate <span className="text-indigo-600">Study Companion</span>
                </h2>
                <p className="text-xl text-neutral-600 max-w-xl mx-auto">
                  Generate quizzes from PDFs, upload JSON, or paste text. Get deep AI analysis of your performance.
                </p>
              </div>

              <div className="max-w-md mx-auto w-full">
                {/* PDF Generation - Now the primary focus */}
                <div className="w-full p-8 bg-white border border-neutral-200 rounded-[2rem] shadow-sm space-y-6">
                  <div className="flex items-center gap-2 text-neutral-600">
                    <FileText className="w-6 h-6" />
                    <span className="font-bold text-sm uppercase tracking-wider">Generate from PDF</span>
                  </div>
                  
                  <div className="space-y-2 text-left">
                    <label className="text-xs font-bold text-neutral-400 uppercase ml-1">Question Count</label>
                    <input 
                      type="number" 
                      value={questionCount}
                      onChange={(e) => setQuestionCount(e.target.value)}
                      placeholder="Enter 1-500"
                      className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-lg font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      min="1" max="500"
                    />
                  </div>

                  <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-neutral-200 border-dashed rounded-[2rem] cursor-pointer hover:bg-neutral-50 transition-colors group">
                    {isGenerating ? (
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-sm font-medium text-neutral-500">Generating Questions...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <div className="bg-neutral-100 p-4 rounded-2xl mb-4 group-hover:bg-indigo-50 transition-colors">
                          <Upload className="w-8 h-8 text-neutral-400 group-hover:text-indigo-600 transition-colors" />
                        </div>
                        <p className="text-lg text-neutral-500 font-bold">Upload Study PDF</p>
                        <p className="text-sm text-neutral-400">PDF will be analyzed by AI</p>
                      </div>
                    )}
                    <input type="file" className="hidden" accept=".pdf" onChange={handlePdfUpload} disabled={isGenerating} />
                  </label>

                  {quizData.length > 0 && !uploadError && (
                    <div className="flex items-center gap-2 p-4 bg-emerald-50 text-emerald-600 rounded-2xl text-sm font-bold">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      {quizData.length} Questions Ready
                    </div>
                  )}
                </div>
              </div>

              {uploadError && (
                <div className="max-w-md mx-auto flex items-center gap-2 p-4 bg-rose-50 text-rose-600 rounded-2xl text-sm font-medium">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {uploadError}
                </div>
              )}

              <button 
                onClick={handleStart}
                disabled={quizData.length === 0}
                className="group relative inline-flex items-center justify-center gap-3 bg-neutral-900 text-white px-16 py-6 rounded-[2rem] font-bold text-2xl hover:bg-indigo-600 disabled:bg-neutral-200 disabled:cursor-not-allowed transition-all shadow-2xl hover:shadow-indigo-200"
              >
                Start Test
                <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Hidden JSON Modal */}
              <AnimatePresence>
                {showJsonModal && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
                    >
                      <div className="p-8 space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-neutral-800">
                            <div className="bg-indigo-100 p-2 rounded-xl">
                              <ClipboardPaste className="w-6 h-6 text-indigo-600" />
                            </div>
                            <h3 className="text-2xl font-bold">Developer JSON Paste</h3>
                          </div>
                          <button 
                            onClick={() => setShowJsonModal(false)}
                            className="text-neutral-400 hover:text-neutral-600 font-bold"
                          >
                            Close
                          </button>
                        </div>

                        <div className="space-y-4">
                          <textarea 
                            value={jsonInput}
                            onChange={(e) => setJsonInput(e.target.value)}
                            placeholder='[{"topic": "...", "q": "...", "a": ["..."], "correct": 0}]'
                            className="w-full h-64 p-6 bg-neutral-50 border border-neutral-200 rounded-3xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                          />
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-neutral-400">
                              Format: Array of Question objects
                            </p>
                            <button 
                              onClick={() => {
                                handlePasteApply();
                                if (!uploadError) setShowJsonModal(false);
                              }}
                              className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                            >
                              Apply Changes
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {screen === 'QUIZ' && quizData.length > 0 && (
            <motion.div 
              key="quiz"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-3xl mx-auto space-y-8"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-widest rounded-full">
                    {currentQuestion.topic}
                  </span>
                  <h3 className="text-3xl font-bold text-neutral-900 leading-tight">
                    {currentQuestion.q}
                  </h3>
                </div>
                {!isAnswered && (
                  <button 
                    onClick={handleSkip}
                    className="flex items-center gap-1 text-neutral-400 hover:text-indigo-600 font-bold text-sm transition-colors"
                  >
                    Skip <SkipForward className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid gap-4">
                {currentQuestion.a.map((answer, idx) => {
                  const isCorrect = idx === currentQuestion.correct;
                  const isSelected = selectedIdx === idx;
                  
                  let stateClasses = "border-neutral-200 hover:border-indigo-300 hover:bg-indigo-50/50";
                  if (isAnswered) {
                    if (isCorrect) stateClasses = "border-emerald-500 bg-emerald-50 text-emerald-900";
                    else if (isSelected) stateClasses = "border-rose-500 bg-rose-50 text-rose-900";
                    else stateClasses = "border-neutral-100 opacity-50 grayscale";
                  }

                  return (
                    <button
                      key={idx}
                      disabled={isAnswered}
                      onClick={() => handleSelect(idx)}
                      className={`group relative w-full text-left p-6 rounded-2xl border-2 transition-all duration-300 flex items-center justify-between ${stateClasses}`}
                    >
                      <span className="text-lg font-medium">{answer}</span>
                      {isAnswered && isCorrect && <CheckCircle2 className="text-emerald-600 w-6 h-6" />}
                      {isAnswered && isSelected && !isCorrect && <XCircle className="text-rose-600 w-6 h-6" />}
                    </button>
                  );
                })}
              </div>

              {isAnswered && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-600" />
                        <h4 className="text-sm font-bold uppercase tracking-widest text-indigo-600">AI Insights</h4>
                      </div>
                      {!aiExplanation && (
                        <button 
                          onClick={() => fetchExplanation(currentQuestion, selectedIdx)}
                          disabled={isLoadingAi}
                          className="text-xs font-bold bg-indigo-600 text-white px-4 py-2 rounded-full hover:bg-indigo-700 transition-all disabled:opacity-50"
                        >
                          {isLoadingAi ? "Thinking..." : "Get AI Explanation"}
                        </button>
                      )}
                    </div>

                    {aiExplanation && (
                      <p className="text-lg leading-relaxed text-neutral-700 animate-fade-in">
                        {aiExplanation}
                      </p>
                    )}
                  </div>

                  <button 
                    onClick={handleNext}
                    className="w-full bg-neutral-900 text-white py-5 rounded-2xl font-bold text-xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 shadow-lg"
                  >
                    {currentIndex === quizData.length - 1 ? "Finish Test" : "Next Question"}
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {screen === 'END' && (
            <motion.div 
              key="end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              <div className="text-center space-y-6">
                <div className="relative inline-block">
                  <Trophy className="w-24 h-24 text-amber-400 mx-auto" />
                  <motion.div 
                    className="absolute inset-0 bg-amber-400/20 blur-3xl rounded-full"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </div>
                <div className="space-y-2">
                  <h2 className="text-5xl font-black text-neutral-900">Test Complete!</h2>
                  <div className="text-7xl font-black text-indigo-600">
                    {Math.round((score / quizData.length) * 100)}%
                  </div>
                  <p className="text-xl text-neutral-600">
                    Score: <span className="font-bold text-neutral-900">{score}</span> / {quizData.length}
                  </p>
                </div>
              </div>

              {/* AI Analysis */}
              <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-6 h-6 text-indigo-600" />
                  <h3 className="text-xl font-bold">Struggling Topics & Analysis</h3>
                </div>
                {isAnalyzing ? (
                  <div className="flex items-center gap-3 text-neutral-400 italic">
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    Analyzing your mistakes...
                  </div>
                ) : (
                  <p className="text-lg text-neutral-700 leading-relaxed">
                    {aiAnalysis}
                  </p>
                )}
              </div>

              {/* Detailed Overview */}
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <History className="w-6 h-6 text-neutral-400" />
                  <h3 className="text-xl font-bold">Question Overview</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {userResults.map((res, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setReviewIndex(idx);
                        setAiExplanation(null);
                      }}
                      className={`p-4 rounded-2xl border-2 transition-all text-center font-bold ${
                        reviewIndex === idx 
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700" 
                          : res.selectedIdx === null
                          ? "border-neutral-200 bg-neutral-100 text-neutral-400"
                          : res.isCorrect
                          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                          : "border-rose-200 bg-rose-50 text-rose-600"
                      }`}
                    >
                      Q{idx + 1}
                    </button>
                  ))}
                </div>

                {/* Review Detail */}
                <AnimatePresence mode="wait">
                  {reviewIndex !== null && (
                    <motion.div 
                      key={reviewIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm space-y-6"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{userResults[reviewIndex].question.topic}</span>
                          <h4 className="text-xl font-bold">{userResults[reviewIndex].question.q}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          {userResults[reviewIndex].selectedIdx === null ? (
                            <span className="px-3 py-1 bg-neutral-100 text-neutral-500 rounded-full text-xs font-bold">SKIPPED</span>
                          ) : userResults[reviewIndex].isCorrect ? (
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-full text-xs font-bold">CORRECT</span>
                          ) : (
                            <span className="px-3 py-1 bg-rose-100 text-rose-600 rounded-full text-xs font-bold">INCORRECT</span>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {userResults[reviewIndex].question.a.map((ans, aIdx) => {
                          const isCorrect = aIdx === userResults[reviewIndex].question.correct;
                          const isSelected = aIdx === userResults[reviewIndex].selectedIdx;
                          return (
                            <div 
                              key={aIdx}
                              className={`p-4 rounded-xl border-2 flex items-center justify-between ${
                                isCorrect 
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-900" 
                                  : isSelected
                                  ? "border-rose-500 bg-rose-50 text-rose-900"
                                  : "border-neutral-100 opacity-50"
                              }`}
                            >
                              <span className="font-medium">{ans}</span>
                              {isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                              {isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-600" />}
                            </div>
                          );
                        })}
                      </div>

                      <div className="bg-indigo-50/50 rounded-2xl p-6 space-y-4 border border-indigo-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-600" />
                            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">AI Explanation</span>
                          </div>
                          {!aiExplanation && (
                            <button 
                              onClick={() => fetchExplanation(userResults[reviewIndex!].question, userResults[reviewIndex!].selectedIdx)}
                              disabled={isLoadingAi}
                              className="text-xs font-bold bg-indigo-600 text-white px-4 py-2 rounded-full hover:bg-indigo-700 transition-all"
                            >
                              {isLoadingAi ? "Thinking..." : "Explain This"}
                            </button>
                          )}
                        </div>
                        {aiExplanation && (
                          <p className="text-neutral-700 leading-relaxed italic">
                            {aiExplanation}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex justify-center pt-8">
                <button 
                  onClick={() => setScreen('START')}
                  className="inline-flex items-center gap-2 bg-neutral-900 text-white px-10 py-5 rounded-2xl font-bold text-xl hover:bg-indigo-600 transition-all shadow-xl"
                >
                  <RotateCcw className="w-6 h-6" />
                  New Test
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-4xl mx-auto px-6 py-12 border-t border-neutral-200">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-neutral-400 font-medium">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <BookOpen className="w-4 h-4" />
              <span>Multi-Source Questions</span>
            </div>
            <div className="flex items-center gap-1">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <p>© 2024 Test Master • AI Study Assistant</p>
        </div>
      </footer>
    </div>
  );
}

