import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Chat, Modality, Type } from '@google/genai';
import { Language, Mode, ChatMessage } from './types';
import { VolumeUpIcon, SendIcon, BotIcon } from './components/icons';
import { decode, decodeAudioData } from './utils/audio';
import ConversationView from './components/ConversationView';

const getSystemPrompt = (language: Language, level: string = 'N5'): string => {
  if (language === Language.JAPANESE) {
    return `あなたは親切で忍耐強い日本語の先生です。名前は「アキ」です。私の日本語の会話練習を手伝うのがあなたの役割です。
自然で魅力的な、長すぎない返事を心がけてください。
あなたの語彙と文法を日本語能力試験（JLPT）の${level}レベルに合わせてください。
もし文法の間違いを見つけたら、優しく訂正してください。
重要：あなたの返答は必ず、次のキーを持つJSONオブジェクトでなければなりません：
1. "japanese": HTMLのルビタグを使ってふりがなを付けた、あなたの日本語の返答。例：「<ruby>日本語<rt>にほんご</rt></ruby>」
2. "romaji": あなたの返答の正確なローマ字表記。`;
  }
  return "You are a friendly and patient English language tutor. Your name is Alex. Your goal is to help me practice conversational English. Keep your responses natural, engaging, and not too long. Correct my grammar mistakes gently if you spot any.";
};

const getSpokenModeSystemPrompt = (language: Language, level: string = 'N5'): string => {
  if (language === Language.JAPANESE) {
    return `あなたは日本語の先生「アキ」です。私は今、音声会話で日本語を練習しています。
あなたの役割は、自然な会話で応答することです。語彙と文法はJLPT ${level}レベルに合わせてください。
文字起こしテキストにはHTMLのルビタグを含めないでください。`;
  }
  return "You are Alex, an English tutor. I am practicing speaking with you. Respond naturally. The system will transcribe your audio response. Correct my grammar mistakes gently.";
};

const getWelcomeMessage = (language: Language): ChatMessage => {
    if (language === Language.ENGLISH) {
        return { 
            role: 'model', 
            text: "Hello! I'm Alex. Ready to practice some English? Ask me anything to start!" 
        };
    }
    return {
        role: 'model',
        text: "こんにちは！アキです。<ruby>日本語<rt>にほんご</rt></ruby>の<ruby>練習<rt>れんしゅう</rt></ruby>を<ruby>始<rt>はじ</rt></ruby>めましょうか？<ruby>何<rt>なん</rt></ruby>でも<ruby>聞<rt>き</rt></ruby>いてくださいね！",
        romaji: "Konnichiwa! Aki desu. Nihongo no renshū o hajimemashō ka? Nandemo kiite kudasai ne!"
    };
}

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>(Language.ENGLISH);
  const [level, setLevel] = useState<string>('N5');
  const [mode, setMode] = useState<Mode>(Mode.WRITTEN);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [audioCache, setAudioCache] = useState<Record<string, AudioBuffer>>({});
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);

  const chatRef = useRef<Chat | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  useEffect(() => {
    if (process.env.API_KEY) {
      setApiKey(process.env.API_KEY);
    } else {
      setError("Configuration Error: API_KEY is not available. Please ensure it is set up correctly in your AI Studio environment.");
    }
  }, []);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  }, []);

  const fetchAndCacheAudio = useCallback(async (text: string) => {
    if (audioCache[text] || !apiKey) return;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const strippedText = text.replace(/<rt>.*?<\/rt>/g, '').replace(/<\/?ruby>/g, '');
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: strippedText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioContext = getAudioContext();
        const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
        setAudioCache(prev => ({ ...prev, [text]: audioBuffer }));
      }
    } catch (e) {
      console.error("Failed to pre-fetch audio:", e);
      // Don't set user-facing error for a background task.
    }
  }, [apiKey, audioCache, getAudioContext]);


  const initializeChat = useCallback(() => {
    if (!apiKey) return;
    setError(null);
    setIsLoading(true);
    try {
        const ai = new GoogleGenAI({ apiKey });
        const systemInstruction = getSystemPrompt(language, level);
        
        const config: any = { systemInstruction };
        if (language === Language.JAPANESE) {
            config.responseMimeType = "application/json";
            config.responseSchema = {
                type: Type.OBJECT,
                properties: {
                    japanese: { type: Type.STRING, description: 'Japanese response with HTML ruby tags for furigana.' },
                    romaji: { type: Type.STRING, description: 'Romaji transcription of the Japanese response.' },
                },
                required: ['japanese', 'romaji'],
            };
        }

        chatRef.current = ai.chats.create({
            model: 'gemini-2.5-flash',
            config,
        });
        const welcomeMessage = getWelcomeMessage(language);
        setMessages([welcomeMessage]);
        fetchAndCacheAudio(welcomeMessage.text);
    } catch (e) {
        setError(e instanceof Error ? e.message : "An unknown error occurred during initialization.");
    } finally {
        setIsLoading(false);
    }
  }, [language, level, apiKey, fetchAndCacheAudio]);

  useEffect(() => {
    if (apiKey) {
      initializeChat();
    }
  }, [initializeChat, apiKey]);
  
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading || !apiKey) return;

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
      
      let modelMessage: ChatMessage;
      if (language === Language.JAPANESE) {
          try {
              const parsed = JSON.parse(response.text);
              modelMessage = { role: 'model', text: parsed.japanese, romaji: parsed.romaji };
          } catch (jsonError) {
              console.error("Failed to parse JSON response:", jsonError, "Raw text:", response.text);
              modelMessage = { role: 'model', text: `Sorry, I had trouble formatting my response. Here is the raw text: ${response.text}` };
          }
      } else {
          modelMessage = { role: 'model', text: response.text };
      }

      setMessages(prev => [...prev, modelMessage]);
      fetchAndCacheAudio(modelMessage.text);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to get a response.";
      setError(errorMessage);
      setMessages(prev => [...prev, {role: 'model', text: `Sorry, an error occurred: ${errorMessage}`}]);
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = async (text: string) => {
    if (loadingAudio === text || !apiKey) return;

    // Play from cache if available
    if (audioCache[text]) {
      const audioContext = getAudioContext();
      const source = audioContext.createBufferSource();
      source.buffer = audioCache[text];
      source.connect(audioContext.destination);
      source.start();
      return;
    }
    
    // Not in cache, so fetch, cache, and play
    setLoadingAudio(text);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const strippedText = text.replace(/<rt>.*?<\/rt>/g, '').replace(/<\/?ruby>/g, '');
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: strippedText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioContext = getAudioContext();
        const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
        setAudioCache(prev => ({ ...prev, [text]: audioBuffer }));
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to play audio.");
    } finally {
      setLoadingAudio(null);
    }
  };


  const renderWrittenMode = () => (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-800 rounded-2xl shadow-2xl p-6">
      <div ref={chatContainerRef} className="flex-grow overflow-y-auto mb-4 pr-4 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'model' && (
              <button
                onClick={() => playAudio(msg.text)}
                disabled={loadingAudio === msg.text || !apiKey}
                className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0 transition-transform duration-200 ease-in-out hover:scale-110 disabled:scale-100 disabled:cursor-pointer disabled:bg-gray-600"
                aria-label="Play audio for this message"
              >
                {loadingAudio === msg.text ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <BotIcon className="w-5 h-5 text-white" />
                )}
              </button>
            )}
            <div className={`max-w-md p-4 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
              {msg.role === 'user' ? (
                <p>{msg.text}</p>
              ) : (
                <>
                  {language === Language.JAPANESE ? (
                    <p dangerouslySetInnerHTML={{ __html: msg.text }}></p>
                  ) : (
                    <p>{msg.text}</p>
                  )}
                  {msg.romaji && (
                    <p className="pt-2 mt-2 border-t border-gray-600 text-sm text-gray-400 font-mono tracking-wide">
                      {msg.romaji}
                    </p>
                  )}
                </>
              )}
               {msg.role === 'user' && (
                 <div className="w-full flex justify-end">
                    <button
                      onClick={() => playAudio(msg.text)}
                      disabled={loadingAudio === msg.text || !apiKey}
                      className={`mt-2 text-blue-200 hover:text-white disabled:text-gray-400`}
                      aria-label="Play audio for this message"
                    >
                    {loadingAudio === msg.text ? (
                        <div className="w-5 h-5 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-blue-200 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <VolumeUpIcon className="w-5 h-5"/>
                    )}
                    </button>
                 </div>
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
            disabled={isLoading || !apiKey}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !userInput.trim() || !apiKey}
            className="p-2 rounded-lg bg-blue-600 text-white disabled:bg-gray-500 transition-colors"
          >
            <SendIcon className="w-5 h-5"/>
          </button>
        </div>
      </div>
    </div>
  );
  
  const renderAppContent = () => {
    if (!apiKey && !error) {
      return (
        <div className="text-center text-gray-400">
          <p>Loading configuration...</p>
        </div>
      );
    }

    if (error && !messages.length) {
      return (
         <div className="w-full max-w-4xl mx-auto p-6 bg-red-900/20 border border-red-500 rounded-xl text-center">
           <h3 className="text-xl font-semibold text-red-300">Error</h3>
           <p className="text-red-400 mt-2">{error}</p>
         </div>
      );
    }
    
    return mode === Mode.WRITTEN ? renderWrittenMode() : <ConversationView language={language} apiKey={apiKey} systemInstruction={getSpokenModeSystemPrompt(language, level)} />;
  }


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

        {language === Language.JAPANESE && (
          <>
            <div className="w-px h-6 bg-gray-600 hidden sm:block"></div>
            <div className="flex gap-1 sm:gap-2">
                {['N5', 'N4', 'N3', 'N2', 'N1'].map(lvl => (
                  <button key={lvl} onClick={() => setLevel(lvl)} 
                    className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${level === lvl ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>
                    {lvl}
                  </button>
                ))}
            </div>
          </>
        )}

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
          {renderAppContent()}
      </main>
    </div>
  );
};

export default App;