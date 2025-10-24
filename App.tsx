
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Chat, Modality } from '@google/genai';
import { Language, Mode, ChatMessage } from './types';
import { VolumeUpIcon, SendIcon, BotIcon } from './components/icons';
import { decode, decodeAudioData } from './utils/audio';
import ConversationView from './components/ConversationView';

const systemPrompts = {
  [Language.ENGLISH]: "You are a friendly and patient English language tutor. Your name is Alex. Your goal is to help me practice conversational English. Keep your responses natural, engaging, and not too long. Correct my grammar mistakes gently if you spot any.",
  [Language.JAPANESE]: "あなたは親切で忍耐強い日本語の先生です。名前は「アキ」です。私の日本語の会話練習を手伝うのがあなたの役割です。自然で魅力的な、長すぎない返事を心がけてください。もし文法の間違いを見つけたら、優しく訂正してください。",
};

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>(Language.ENGLISH);
  const [mode, setMode] = useState<Mode>(Mode.WRITTEN);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chatRef = useRef<Chat | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const initializeChat = useCallback(() => {
    setError(null);
    setIsLoading(true);
    try {
        if (!process.env.API_KEY) {
            throw new Error("API key not found. Please set the API_KEY environment variable.");
        }
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const systemInstruction = systemPrompts[language];
        chatRef.current = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction },
        });
        const welcomeMessage: ChatMessage = {
            role: 'model',
            text: language === Language.ENGLISH ? "Hello! I'm Alex. Ready to practice some English? Ask me anything to start!" : "こんにちは！アキです。日本語の練習を始めましょうか？何でも聞いてくださいね！",
        };
        setMessages([welcomeMessage]);
    } catch (e) {
        setError(e instanceof Error ? e.message : "An unknown error occurred during initialization.");
    } finally {
        setIsLoading(false);
    }
  }, [language]);

  useEffect(() => {
    initializeChat();
  }, [initializeChat]);
  
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: userInput };
    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);
    setError(null);

    try {
      if (!chatRef.current) {
        throw new Error("Chat is not initialized.");
      }
      const response = await chatRef.current.sendMessage({ message: userInput });
      const modelMessage: ChatMessage = { role: 'model', text: response.text };
      setMessages(prev => [...prev, modelMessage]);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to get a response.";
      setError(errorMessage);
      setMessages(prev => [...prev, {role: 'model', text: `Sorry, an error occurred: ${errorMessage}`}]);
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = async (text: string) => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
        if (!process.env.API_KEY) {
            throw new Error("API key not found.");
        }
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          // FIX: Add type assertion to handle browser-prefixed AudioContext for TypeScript.
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioContext = audioContextRef.current;
        const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to play audio.");
    } finally {
      setIsLoading(false);
    }
  };


  const renderWrittenMode = () => (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-800 rounded-2xl shadow-2xl p-6">
      <div ref={chatContainerRef} className="flex-grow overflow-y-auto mb-4 pr-4 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                <BotIcon className="w-5 h-5 text-white" />
              </div>
            )}
            <div className={`max-w-md p-4 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
              <p>{msg.text}</p>
              {msg.role === 'model' && (
                <button onClick={() => playAudio(msg.text)} className="mt-2 text-teal-400 hover:text-teal-300">
                  <VolumeUpIcon className="w-5 h-5"/>
                </button>
              )}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
             <div className="flex items-start gap-3">
                 <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                    <BotIcon className="w-5 h-5 text-white" />
                 </div>
                 <div className="max-w-md p-4 rounded-2xl bg-gray-700 text-gray-200 rounded-bl-none flex items-center">
                    <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse mr-2"></div>
                    <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse mr-2 delay-150"></div>
                    <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse delay-300"></div>
                 </div>
             </div>
        )}
      </div>
      <div className="flex-shrink-0">
         {error && <p className="text-red-400 text-sm text-center mb-2">{error}</p>}
        <div className="flex items-center bg-gray-700 rounded-xl p-2">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={language === Language.ENGLISH ? "Type your message..." : "メッセージを入力..."}
            className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-gray-400"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !userInput.trim()}
            className="p-2 rounded-lg bg-blue-600 text-white disabled:bg-gray-500 transition-colors"
          >
            <SendIcon className="w-5 h-5"/>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 font-sans text-white p-4 sm:p-8 flex flex-col items-center">
      <header className="w-full max-w-4xl mx-auto mb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">
          Gemini Language Coach
        </h1>
        <p className="text-gray-400 mt-2">Your AI partner for mastering a new language.</p>
      </header>
      
      <div className="w-full max-w-4xl mx-auto mb-6 p-2 bg-gray-800 rounded-xl flex flex-col sm:flex-row justify-center items-center gap-4 shadow-lg">
        <div className="flex gap-2">
            {[Language.ENGLISH, Language.JAPANESE].map(lang => (
              <button key={lang} onClick={() => setLanguage(lang)} 
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${language === lang ? 'bg-teal-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>
                {lang}
              </button>
            ))}
        </div>
        <div className="w-px h-6 bg-gray-600 hidden sm:block"></div>
        <div className="flex gap-2">
            {[Mode.WRITTEN, Mode.SPOKEN].map(m => (
                <button key={m} onClick={() => setMode(m)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>
                {m} Practice
                </button>
            ))}
        </div>
      </div>

      <main className="w-full flex-grow flex items-center justify-center">
          {mode === Mode.WRITTEN ? renderWrittenMode() : <ConversationView language={language} />}
      </main>
    </div>
  );
};

export default App;
