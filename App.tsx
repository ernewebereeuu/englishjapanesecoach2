import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Chat, Modality } from '@google/genai';
import { Language, Mode, ChatMessage } from './types';
import { VolumeUpIcon, SendIcon, BotIcon } from './components/icons';
import { decode, decodeAudioData } from './utils/audio';
import ConversationView from './components/ConversationView';

const getLevelDescription = (level: string) => {
    switch (level) {
        case 'N5': return 'Nivel Principiante (N5): Usa vocabulario y gramática muy básicos. Estructuras de frases simples. Enfócate en conversaciones cotidianas como saludos y presentaciones. No uses kanji.';
        case 'N4': return 'Nivel Básico (N4): Usa vocabulario y gramática básicos. Habla de actividades diarias, compras, etc. Puedes empezar a usar kanji muy simples y comunes, pero siempre con furigana (formato <ruby>漢字<rt>かんじ</rt></ruby>).';
        case 'N3': return 'Nivel Intermedio (N3): Usa un rango más amplio de vocabulario y gramática para situaciones más complejas. Usa kanji de uso común, siempre con furigana (formato <ruby>漢字<rt>かんじ</rt></ruby>).';
        case 'N2': return 'Nivel Intermedio-Avanzado (N2): Usa gramática y vocabulario más complejos, adecuados para conversaciones sobre noticias o temas de trabajo. Usa kanji de forma más extensa, siempre con furigana (formato <ruby>漢字<rt>かんじ</rt></ruby>).';
        case 'N1': return 'Nivel Avanzado (N1): Demuestra un dominio casi nativo. Usa expresiones idiomáticas, vocabulario especializado y estructuras gramaticales complexas. Usa kanji avanzados, siempre con furigana (formato <ruby>漢字<rt>かんじ</rt></ruby>).';
        default: return '';
    }
}

const getSystemPrompt = (language: Language, level: string = 'N5'): string => {
  if (language === Language.JAPANESE) {
    const levelDescription = getLevelDescription(level);
    const useKanji = ['N4', 'N3', 'N2', 'N1'].includes(level);

    return `あなたは親切で忍耐強い日本語の先生「アキ」です。私の日本語の会話練習を手伝うのがあなたの役割です。

現在のレベル設定: ${levelDescription}

**あなたの返答に関する厳格なルール:**
1. 最初に、ユーザーへの日本語の返答を書いてください。
   ${useKanji 
     ? '- 漢字を使用できますが、必ず全ての漢字に<ruby>タグでふりがなを付けてください。例: <ruby>日本語<rt>にほんご</rt></ruby>' 
     : '- 漢字は使わず、ひらがなとカタカナのみを使用してください。'}
2. 日本語の返答の後に、必ず \`---\` という区切り線を入れてください。
3. 区切り線の後、新しい行に \`Speech:\` と書き、その後に音声再生用のひらがな・カタカナのみのテキストを続けてください。
4. さらに新しい行に \`Romaji:\` と書き、その後にローマ字表記を続けてください。

**例 (${level}):**
${level === 'N5' ? 
`こんにちは。おげんきですか。
---
Speech: こんにちは。おげんきですか。
Romaji: Konnichiwa. Ogenki desu ka.` : 
`はい、<ruby>今日<rt>きょう</rt></ruby>は<ruby>学校<rt>がっこう</rt></ruby>に<ruby>行<rt>い</rt></ruby>きました。
---
Speech: はい、きょうはがっこうにいきました。
Romaji: Hai, kyou wa gakkou ni ikimashita.`
}
`;
  }
  return "You are a friendly and patient English language tutor. Your name is Alex. Your goal is to help me practice conversational English. Keep your responses natural, engaging, and not too long. Correct my grammar mistakes gently if you spot any. Respond with text only, do not use markdown.";
};


const getSpokenModeSystemPrompt = (language: Language, level: string = 'N5'): string => {
  if (language === Language.JAPANESE) {
    const levelDescription = getLevelDescription(level);
    return `あなたは日本語の先生「アキ」です。私と音声で会話をします。

**現在のレベル設定: ${levelDescription}**

あなたには「音声」と「テキスト」という2つの出力方法があります。

**厳格なルール:**

1.  **音声出力:**
    *   **日本語の文章のみ**を話してください。
    *   あなたの会話は、上記で指定されたJLPTレベルの難易度に厳密に従ってください。
    *   自然で、長すぎない会話を心がけてください。
    *   **絶対に、絶対にローマ字を声に出して読まないでください。**

2.  **テキスト出力:**
    *   あなたのテキストは、改行で区切られた2つのパートでなければなりません。
    *   **パート1:** あなたが音声で話した日本語の文章（ひらがなとカタカナのみ、漢字なし）。
    *   **パート2:** \`Romaji: \`という接頭辞の後に、その日本語の文章の正確なローマ字表記を続けてください。この行には日本語の文字を含めないでください。

**例:**
*   **あなたの音声出力:** 「げんきですか。」 (これだけを話す)
*   **あなたのテキスト出力:**
    げんきですか。
    Romaji: Genki desu ka.

**結論:** 音声は純粋な日本語、テキストは日本語とローマ字の両方です。このルールは絶対に守ってください。`;
  }
  return "You are Alex, an English tutor. I am practicing speaking with you. Respond naturally. The system will transcribe your audio response. Correct my grammar mistakes gently.";
};

const getWelcomeMessage = (language: Language): ChatMessage => {
    if (language === Language.ENGLISH) {
        return { 
            role: 'model', 
            text: "Hello! I'm Alex. Ready to practice some English? Ask me anything to start!",
            speech: "Hello! I'm Alex. Ready to practice some English? Ask me anything to start!",
        };
    }
    return {
        role: 'model',
        text: "こんにちは！アキです。にほんごのれんしゅうをはじめましょうか？なんでもきいてくださいね！",
        speech: "こんにちは！アキです。にほんごのれんしゅうをはじめましょうか？なんでもきいてくださいね！",
        romaji: "Konnichiwa! Aki desu. Nihongo no renshū o hajimemashō ka? Nandemo kiite kudasai ne!"
    };
}

const JapaneseText: React.FC<{ text: string }> = ({ text }) => {
  const finalElements = [];
  let lastIndex = 0;
  const regex = /<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/g;
  let match;
  let i = 0;
  
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      finalElements.push(text.substring(lastIndex, match.index));
    }
    const [, base, furigana] = match;
    finalElements.push(
      <ruby key={`ruby-${i++}`}>
        {base}
        <rt>{furigana}</rt>
      </ruby>
    );
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    finalElements.push(text.substring(lastIndex));
  }

  return <p>{finalElements}</p>;
};

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
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const response = await fetch('/api/get-key');
        if (!response.ok) {
            const errorText = await response.text();
            try {
                // It might be a JSON error, which is what we expect.
                const errorJson = JSON.parse(errorText);
                throw new Error(errorJson.error || errorText);
            } catch (e) {
                // It's not JSON, so it's a different kind of error.
                // Display the raw text, it might be a Vercel error message.
                throw new Error(errorText || `Failed to fetch API key: ${response.statusText}`);
            }
        }
        const data = await response.json();
        if (data.apiKey) {
          setApiKey(data.apiKey);
        } else {
          throw new Error("API key not found in server response.");
        }
      } catch (error) {
        console.error("Error fetching API key:", error);
        setError(error instanceof Error ? error.message : "An unknown error occurred while fetching the API key.");
      }
    };
    
    fetchApiKey();
  }, []);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  }, []);

  const fetchAndCacheAudio = useCallback(async (text: string) => {
    if (!text || audioCache[text] || !apiKey) return;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { voiceName: language === Language.JAPANESE ? 'Kore' : 'Zephyr' } },
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
    }
  }, [apiKey, audioCache, getAudioContext, language]);


  const initializeChat = useCallback(() => {
    if (!apiKey) return;
    setError(null);
    setIsLoading(true);
    try {
        const ai = new GoogleGenAI({ apiKey });
        const systemInstruction = getSystemPrompt(language, level);
        
        chatRef.current = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction },
        });

        const welcomeMessage = getWelcomeMessage(language);
        setMessages([welcomeMessage]);
        fetchAndCacheAudio(welcomeMessage.speech || welcomeMessage.text);
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

    const userMessage: ChatMessage = { role: 'user', text: userInput, speech: userInput };
    setMessages(prev => [...prev, userMessage, { role: 'model', text: '' }]);
    const currentInput = userInput;
    setUserInput('');
    setIsLoading(true);
    setError(null);

    try {
      if (!chatRef.current) {
        throw new Error("Chat is not initialized.");
      }
      
      const responseStream = await chatRef.current.sendMessageStream({ message: currentInput });

      let fullResponseText = '';
      for await (const chunk of responseStream) {
        const chunkText = chunk.text;
        if (chunkText) {
            fullResponseText += chunkText;
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage.role === 'model') {
                    if (language === Language.JAPANESE) {
                        lastMessage.text = fullResponseText.split('---')[0];
                    } else {
                        lastMessage.text = fullResponseText;
                    }
                }
                return newMessages;
            });
        }
      }

      setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'model') {
              let finalMessage: ChatMessage;
              if (language === Language.JAPANESE) {
                  const parts = fullResponseText.split('---');
                  const japaneseText = parts[0]?.trim() || '';
                  const metaContent = parts[1] || '';
                  
                  const speechMatch = metaContent.match(/Speech:\s*(.*)/);
                  const romajiMatch = metaContent.match(/Romaji:\s*(.*)/);

                  finalMessage = {
                      role: 'model',
                      text: japaneseText,
                      speech: speechMatch ? speechMatch[1].trim() : '',
                      romaji: romajiMatch ? romajiMatch[1].trim() : '',
                  };
              } else {
                  finalMessage = { role: 'model', text: fullResponseText, speech: fullResponseText };
              }
              newMessages[newMessages.length - 1] = finalMessage;
              fetchAndCacheAudio(finalMessage.speech || finalMessage.text);
          }
          return newMessages;
      });

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to get a response.";
      setError(errorMessage);
      setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'model' && lastMessage.text === '') {
              newMessages[newMessages.length - 1] = {role: 'model', text: `Sorry, an error occurred: ${errorMessage}`};
          } else {
              newMessages.push({role: 'model', text: `Sorry, an error occurred: ${errorMessage}`});
          }
          return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };


  const playAudio = async (text: string) => {
    if (!text || loadingAudio === text || !apiKey) return;
    
    if (audioCache[text]) {
      const audioContext = getAudioContext();
      const source = audioContext.createBufferSource();
      source.buffer = audioCache[text];
      source.connect(audioContext.destination);
      source.start();
      return;
    }
    
    setLoadingAudio(text);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { voiceName: language === Language.JAPANESE ? 'Kore' : 'Zephyr' } },
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
                onClick={() => playAudio(msg.speech || msg.text)}
                disabled={loadingAudio === (msg.speech || msg.text) || !apiKey || !msg.speech}
                className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0 transition-transform duration-200 ease-in-out hover:scale-110 disabled:scale-100 disabled:cursor-not-allowed disabled:bg-gray-600"
                aria-label="Play audio for this message"
              >
                {loadingAudio === (msg.speech || msg.text) ? (
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
                  <JapaneseText text={msg.text} />
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
                      onClick={() => playAudio(msg.speech || msg.text)}
                      disabled={loadingAudio === (msg.speech || msg.text) || !apiKey}
                      className={`mt-2 text-blue-200 hover:text-white disabled:text-gray-400`}
                      aria-label="Play audio for this message"
                    >
                    {loadingAudio === (msg.speech || msg.text) ? (
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
        {isLoading && messages[messages.length - 1]?.role === 'model' && !messages[messages.length - 1]?.text && (
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
            <div className="flex items-center gap-1 sm:gap-2">
              {[
                { value: 'N5', description: 'Principiante' },
                { value: 'N4', description: 'Básico' },
                { value: 'N3', description: 'Intermedio' },
                { value: 'N2', description: 'Avanzado' },
                { value: 'N1', description: 'Experto' },
              ].map(lvl => (
                <button key={lvl.value} onClick={() => setLevel(lvl.value)}
                  title={`${lvl.value} - ${lvl.description}`}
                  className={`px-2 py-1 w-20 h-12 text-center text-xs sm:text-sm font-semibold rounded-lg transition-colors flex flex-col justify-center items-center leading-tight ${level === lvl.value ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>
                  <span className="font-bold text-sm sm:text-base">{lvl.value}</span>
                  <span className="text-[10px] sm:text-xs opacity-80">{lvl.description}</span>
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