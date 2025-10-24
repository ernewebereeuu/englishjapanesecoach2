import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, Type, Content, Part } from '@google/genai';
import { Language, Mode, ChatMessage } from './types';
import { VolumeUpIcon, SendIcon, BotIcon } from './components/icons';
import { decode, decodeAudioData } from './utils/audio';
import { getFriendlyErrorMessage } from './utils/error';
import ConversationView from './components/ConversationView';
import WordBreakdownModal from './components/WordBreakdownModal';

const getLevelDescription = (level: string) => {
    switch (level) {
        case 'N5': return 'Beginner (N5): Use basic vocabulary and grammar, focusing on daily conversations like greetings and self-introductions. Do not use kanji.';
        case 'N4': return 'Elementary (N4): Use basic vocabulary and grammar for topics like daily activities and shopping. You can start using very common and simple kanji, but always provide furigana (in <ruby>漢字<rt>かんじ</rt></ruby> format).';
        case 'N3': return 'Intermediate (N3): Use a wider range of vocabulary and grammar to handle more complex situations. Use common kanji, but always provide furigana.';
        case 'N2': return 'Upper-Intermediate (N2): Use more complex grammar and vocabulary suitable for conversations on topics like news and work. Use a wide range of kanji, but always provide furigana.';
        case 'N1': return 'Advanced (N1): Demonstrate near-native ability. Use idiomatic expressions, technical terms, and complex grammatical structures. Use advanced kanji, but always provide furigana.';
        default: return '';
    }
}

const getSystemPrompt = (language: Language, level: string = 'N5'): string => {
  if (language === Language.JAPANESE) {
    const levelDescription = getLevelDescription(level);
    return `You are a friendly and patient Japanese language tutor named "Aki". Your role is to help me practice conversational Japanese.

Current Level Setting: ${levelDescription}

**Strict Rules for Your Response:**
1. You MUST reply with a single JSON object. Do not add any text before or after the JSON.
2. The JSON object must conform to the provided schema.
3. Your goal is to have a natural conversation, but your output must be the structured JSON.
4. For the 'breakdown' array, analyze your Japanese response sentence. Break it down into logical words or particles. For each, provide the original Japanese word, its Romaji transcription, and its meaning in SPANISH.
`;
  }
  return "You are a friendly and patient English language tutor. Your name is Alex. Your goal is to help me practice conversational English. Keep your responses natural, engaging, and not too long. Correct my grammar mistakes gently if you spot any. Respond with text only, do not use markdown.";
};

const japaneseResponseSchema = {
    type: Type.OBJECT,
    properties: {
        displayText: { 
            type: Type.STRING,
            description: "The Japanese response for display. Use Kanji according to the level, but ALWAYS provide furigana for all Kanji using <ruby> tags. Example: <ruby>日本語<rt>にほんご</rt></ruby>."
        },
        speechText: {
            type: Type.STRING,
            description: "The same response but in plain hiragana/katakana ONLY, for text-to-speech."
        },
        romajiText: {
            type: Type.STRING,
            description: "The Romaji transcription of the full response."
        },
        breakdown: {
            type: Type.ARRAY,
            description: "An array breaking down the Japanese sentence into words/particles.",
            items: {
                type: Type.OBJECT,
                properties: {
                    word: { type: Type.STRING, description: "A single word or particle from the sentence (e.g., <ruby>私<rt>わたし</rt></ruby>, の, <ruby>名前<rt>なまえ</rt></ruby>)." },
                    romaji: { type: Type.STRING, description: "The Romaji for that word." },
                    spanish: { type: Type.STRING, description: "The SPANISH meaning of that word." }
                },
                required: ["word", "romaji", "spanish"]
            }
        }
    },
    required: ["displayText", "speechText", "romajiText", "breakdown"]
};


const getSpokenLevelDescription = (level: string): string => {
    switch (level) {
        case 'N5': return '初心者レベル（N5）：基本的な語彙と文法を使い、挨拶や自己紹介などの日常会話に集中します。漢字は使いません。';
        case 'N4': return '初級レベル（N4）：日常の活動や買い物などについて話すための基本的な語彙と文法を使います。簡単で一般的な漢字を使い始めることができますが、会話では自然に話してください。';
        case 'N3': return '中級レベル（N3）：より複雑な状況に対応するために、より広い範囲の語彙と文法を使います。自然な会話を心がけてください。';
        case 'N2': return '中上級レベル（N2）：ニュースや仕事の話題に関する会話に適した、より複雑な文法と語彙を使います。';
        case 'N1': return '上級レベル（N1）：ネイティブに近い能力で会話します。慣用句、専門用語、複雑な文法構造を使います。';
        default: return '';
    }
};


const getSpokenModeSystemPrompt = (language: Language, level: string = 'N5'): string => {
  if (language === Language.JAPANESE) {
    const levelDescription = getSpokenLevelDescription(level);
    return `You are Aki, a conversational AI Japanese tutor. Your only job is to have a natural Japanese conversation with the user.

**Strict Rules for Your TEXT Response (sent along with your voice):**
1.  **NEVER output your thought process or meta-commentary.** Your response must ONLY be the text in the specified format.
2.  The format must be:
    -   Line 1: Your spoken response in Japanese, with Kanji and Furigana (<ruby>タグ).
    -   Line 2: \`---\`
    -   Line 3: \`Romaji: [Your full sentence in Romaji]\`
    -   Line 4: \`---\`
    -   Line 5: \`Breakdown:\`
    -   Following lines: Each line must be a word analysis in the format \`Japanese Word | Romaji | Spanish Meaning\`.

**Example:**
<ruby>今日<rt>きょう</rt></ruby>は<ruby>良<rt>い</rt></ruby>い<ruby>天気<rt>てんき</rt></ruby>ですね。
---
Romaji: Kyō wa ii tenki desu ne.
---
Breakdown:
<ruby>今日<rt>きょう</rt></ruby> | kyō | hoy
は | wa | (partícula de tema)
<ruby>良<rt>い</rt></ruby>い | ii | buen
<ruby>天気<rt>てんき</rt></ruby> | tenki | tiempo (clima)
ですね | desu ne | ¿verdad? / es

Current conversation level: ${levelDescription}`;
  }
  return "You are Alex, a conversational AI language tutor. Your only job is to have a natural English conversation with the user. Do not, under any circumstances, output your thought process, plans, or any meta-commentary. Your entire response must be only the text you would speak in a conversation. Just act like a human, listen, and respond.";
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
        text: "<ruby>こんにちは<rt>こんにちは</rt></ruby>！アキです。<ruby>日本語<rt>にほんご</rt></ruby>の<ruby>練習<rt>れんしゅう</rt></ruby>を<ruby>始<rt>はじ</rt></ruby>めましょうか？なんでも<ruby>聞<rt>き</rt></ruby>いてくださいね！",
        speech: "こんにちは！アキです。にほんごのれんしゅうをはじめましょうか？なんでもきいてくださいね！",
        romaji: "Konnichiwa! Aki desu. Nihongo no renshū o hajimemashō ka? Nandemo kiite kudasai ne!",
        breakdown: [
            { word: 'こんにちは', romaji: 'konnichiwa', spanish: 'hola' },
            { word: '！', romaji: '!', spanish: '(puntuación)' },
            { word: 'アキ', romaji: 'Aki', spanish: 'Aki (nombre)' },
            { word: 'です', romaji: 'desu', spanish: 'soy / es' },
            { word: '。', romaji: '.', spanish: '(puntuación)' },
            { word: '<ruby>日本語<rt>にほんご</rt></ruby>', romaji: 'nihongo', spanish: 'idioma japonés' },
            { word: 'の', romaji: 'no', spanish: 'de (partícula)' },
            { word: '<ruby>練習<rt>れんしゅう</rt></ruby>', romaji: 'renshū', spanish: 'práctica' },
            { word: 'を', romaji: 'o', spanish: '(partícula de objeto)' },
            { word: '<ruby>始<rt>はじ</rt></ruby>めましょう', romaji: 'hajimemashō', spanish: 'empecemos' },
            { word: 'か', romaji: 'ka', spanish: '(partícula de pregunta)' },
            { word: '？', romaji: '?', spanish: '(puntuación)' },
            { word: 'なんでも', romaji: 'nandemo', spanish: 'cualquier cosa' },
            { word: '<ruby>聞<rt>き</rt></ruby>いてください', romaji: 'kiite kudasai', spanish: 'pregunta por favor' },
            { word: 'ね', romaji: 'ne', spanish: '(partícula de énfasis)' },
        ]
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
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>(Language.ENGLISH);
  const [level, setLevel] = useState<string>('N5');
  const [mode, setMode] = useState<Mode>(Mode.WRITTEN);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [spokenMessages, setSpokenMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);

  const aiClient = useRef<GoogleGenAI | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioCacheRef = useRef<Record<string, AudioBuffer>>({});

  useEffect(() => {
    const initializeApiKey = async () => {
      // First, try to use the key if it's directly injected (for AI Studio)
      if (process.env.API_KEY) {
        setApiKey(process.env.API_KEY);
        aiClient.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return;
      }

      // If not found, fall back to fetching from the API route (for Vercel)
      try {
        const response = await fetch('/api/get-key');
        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Failed to fetch API key from server.' }));
          throw new Error(errData.error || 'Check server environment variables.');
        }
        const data = await response.json();
        if (data.apiKey) {
          setApiKey(data.apiKey);
          aiClient.current = new GoogleGenAI({ apiKey: data.apiKey });
        } else {
          throw new Error('API key not found in server response.');
        }
      } catch (err) {
        console.error(err);
        setApiKeyError(err instanceof Error ? err.message : "Could not initialize API key. Ensure it's set in your environment variables.");
      }
    };
    
    initializeApiKey();
  }, []);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  }, []);

  const fetchAndCacheAudio = useCallback(async (text: string) => {
    if (!text || audioCacheRef.current[text] || !aiClient.current) return;

    try {
      const response = await aiClient.current.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: language === Language.JAPANESE ? 'Kore' : 'Zephyr' } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioContext = getAudioContext();
        const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
        audioCacheRef.current[text] = audioBuffer;
      }
    } catch (e) {
      console.error("Failed to pre-fetch audio:", getFriendlyErrorMessage(e));
    }
  }, [getAudioContext, language]);


  const initializeChat = useCallback(() => {
    setError(null);
    const welcomeMessage = getWelcomeMessage(language);
    setMessages([welcomeMessage]);
    if(welcomeMessage.speech) fetchAndCacheAudio(welcomeMessage.speech);
  }, [language, fetchAndCacheAudio]);

  useEffect(() => {
    if (apiKey) {
      initializeChat();
    }
  }, [initializeChat, language, apiKey]);
  
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, spokenMessages]);

  useEffect(() => {
    // Reset conversation history when user switches mode or language
    setSpokenMessages([]);
  }, [language, mode]);


  const appendSpokenMessages = useCallback((newMessages: ChatMessage[]) => {
    setSpokenMessages(prev => [...prev, ...newMessages]);
  }, []);

  const clearSpokenMessages = useCallback(() => {
    setSpokenMessages([]);
  }, []);

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading || !aiClient.current) return;

    const userMessage: ChatMessage = { role: 'user', text: userInput };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setUserInput('');
    setIsLoading(true);
    setError(null);

    try {
        const systemInstruction = getSystemPrompt(language, level);
        
        const contents: Content[] = newMessages.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.role === 'model' && msg.speech ? msg.speech : msg.text }],
        }));

        const response = await aiClient.current.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction,
                ...(language === Language.JAPANESE && {
                    responseMimeType: 'application/json',
                    responseSchema: japaneseResponseSchema
                })
            }
        });
        
        const responseText = response.text.trim();
        let modelMessage: ChatMessage;

        if (language === Language.JAPANESE) {
            const parsedJson = JSON.parse(responseText);
            modelMessage = {
                role: 'model',
                text: parsedJson.displayText,
                speech: parsedJson.speechText,
                romaji: parsedJson.romajiText,
                breakdown: parsedJson.breakdown,
            };
        } else {
            modelMessage = {
                role: 'model',
                text: responseText,
                speech: responseText,
            };
        }
        
        setMessages(prev => [...prev, modelMessage]);
        if(modelMessage.speech) fetchAndCacheAudio(modelMessage.speech);

    } catch (e) {
      const friendlyError = getFriendlyErrorMessage(e);
      setError(friendlyError);
       setMessages(prev => [...prev, {role: 'model', text: `Lo siento, ocurrió un error: ${friendlyError}`}]);
    } finally {
      setIsLoading(false);
    }
  };


  const playAudio = async (text: string) => {
    if (!text || loadingAudio === text || !aiClient.current) return;
    
    if (audioCacheRef.current[text]) {
      const audioContext = getAudioContext();
      const source = audioContext.createBufferSource();
      source.buffer = audioCacheRef.current[text];
      source.connect(audioContext.destination);
      source.start();
      return;
    }
    
    setLoadingAudio(text);
    setError(null);
    try {
      const response = await aiClient.current.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: language === Language.JAPANESE ? 'Kore' : 'Zephyr' } } },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioContext = getAudioContext();
        const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
        audioCacheRef.current[text] = audioBuffer;
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
      }
    } catch (e) {
        const friendlyError = getFriendlyErrorMessage(e);
        setError(friendlyError);
    } finally {
      setLoadingAudio(null);
    }
  };

  const handleOpenModal = (message: ChatMessage) => {
    if (message.breakdown && message.breakdown.length > 0) {
        setSelectedMessage(message);
        setIsModalOpen(true);
    }
  };

  const renderWrittenMode = () => (
    <>
      <WordBreakdownModal isOpen={isModalOpen} message={selectedMessage} onClose={() => setIsModalOpen(false)} />
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-800 rounded-2xl shadow-2xl p-6">
        <div ref={chatContainerRef} className="flex-grow overflow-y-auto mb-4 pr-4 space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'model' && (
                <button
                  onClick={() => playAudio(msg.speech || msg.text)}
                  disabled={loadingAudio === (msg.speech || msg.text) || !msg.speech}
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
              <div
                onClick={() => msg.role === 'model' && handleOpenModal(msg)}
                className={`max-w-md p-4 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : `bg-gray-700 text-gray-200 rounded-bl-none ${msg.breakdown ? 'cursor-pointer hover:bg-gray-600' : ''}`}`}>
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
                {msg.role === 'user' && msg.speech && (
                  <div className="w-full flex justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); playAudio(msg.speech!); }}
                        disabled={loadingAudio === (msg.speech || msg.text)}
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
          {isLoading && (
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
    </>
  );
  
  const renderAppContent = () => {
    if (apiKeyError) {
      return (
        <div className="w-full max-w-4xl mx-auto text-center p-8 bg-gray-800 rounded-2xl">
          <h2 className="text-2xl font-bold text-red-500 mb-4">Error de Configuración</h2>
          <p className="text-gray-300 mb-2">No se pudo inicializar la aplicación.</p>
          <p className="text-red-400 bg-gray-900 p-3 rounded-lg font-mono text-sm">{apiKeyError}</p>
        </div>
      );
    }

    if (!apiKey) {
      return (
        <div className="w-full max-w-4xl mx-auto text-center p-8">
          <div className="flex justify-center items-center gap-4">
            <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xl text-gray-300">Inicializando el coach de idiomas...</p>
          </div>
        </div>
      );
    }

    return (
      <>
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
              {mode === Mode.WRITTEN ? renderWrittenMode() : <ConversationView language={language} systemInstruction={getSpokenModeSystemPrompt(language, level)} apiKey={apiKey} history={spokenMessages} onAppendMessages={appendSpokenMessages} onClearHistory={clearSpokenMessages} />}
          </main>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 font-sans text-white p-4 sm:p-8 flex flex-col items-center">
      <header className="w-full max-w-4xl mx-auto mb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">
          Gemini Language Coach
        </h1>
        <p className="text-gray-400 mt-2">Your AI partner for mastering a new language.</p>
      </header>
      
      {renderAppContent()}

    </div>
  );
};

export default App;
