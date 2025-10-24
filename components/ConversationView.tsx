import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import { Language } from '../types';
import { MicrophoneIcon } from './icons';
import { encode, decode, decodeAudioData } from '../utils/audio';

interface ConversationViewProps {
  language: Language;
  apiKey: string | null;
}

interface TranscriptionEntry {
  speaker: 'user' | 'model';
  text: string;
}

// Define system prompts based on language
const systemPrompts = {
  [Language.ENGLISH]: "You are a friendly and patient English language tutor. Your name is Alex. Your goal is to help me practice conversational English. Keep your responses natural, engaging, and not too long. Correct my grammar mistakes gently if you spot any.",
  [Language.JAPANESE]: "あなたは親切で忍耐強い日本語の先生です。名前は「アキ」です。私の日本語の会話練習を手伝うのがあなたの役割です。自然で魅力的な、長すぎない返事を心がけてください。もし文法の間違いを見つけたら、優しく訂正してください。",
};

const ConversationView: React.FC<ConversationViewProps> = ({ language, apiKey }) => {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Mantén presionado el botón para hablar.');
  const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionEntry[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const currentInputRef = useRef('');
  const currentOutputRef = useRef('');

  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const stopConversation = useCallback(() => {
    setIsListening(false);
    setStatus('Mantén presionado el botón para hablar.');
    
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close());
        sessionPromiseRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    
    if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
    }

    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
    }
    
    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

  }, []);

  const startConversation = useCallback(async () => {
    if (isListening || !apiKey) {
      if (!apiKey) setStatus('Error: API Key not available.');
      return;
    }

    // For push-to-talk, clear current turn data, but not the whole history
    setCurrentInput('');
    setCurrentOutput('');
    currentInputRef.current = '';
    currentOutputRef.current = '';

    setStatus('Connecting...');
    setIsListening(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: systemPrompts[language],
        },
        callbacks: {
          onopen: async () => {
            setStatus('Listening...');
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

            mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob: Blob = {
                data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            
            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              currentInputRef.current += message.serverContent.inputTranscription.text;
              setCurrentInput(currentInputRef.current);
            }
            if (message.serverContent?.outputTranscription) {
              currentOutputRef.current += message.serverContent.outputTranscription.text;
              setCurrentOutput(currentOutputRef.current);
            }
            if (message.serverContent?.turnComplete) {
              const fullInput = currentInputRef.current;
              const fullOutput = currentOutputRef.current;
              setTranscriptionHistory(prev => [
                ...prev, 
                { speaker: 'user', text: fullInput },
                { speaker: 'model', text: fullOutput },
              ]);
              currentInputRef.current = '';
              currentOutputRef.current = '';
              setCurrentInput('');
              setCurrentOutput('');
            }

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
              const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current, 24000, 1);
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioContextRef.current.destination);
              source.onended = () => audioSourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
                audioSourcesRef.current.forEach(s => s.stop());
                audioSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('API Error:', e);
            setStatus(`Error: ${e.message}`);
            stopConversation();
          },
          onclose: () => {
             // Handled by user action
          },
        },
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (error) {
      console.error("Failed to start conversation:", error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsListening(false);
    }
  }, [isListening, language, stopConversation, apiKey]);

  useEffect(() => {
    return () => {
      stopConversation();
    };
  }, [stopConversation]);

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-800 rounded-2xl shadow-2xl p-6">
      <div className="flex-grow overflow-y-auto pr-4 space-y-4">
        {transcriptionHistory.map((entry, index) => (
          <div key={index} className={`flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-md p-3 rounded-lg ${entry.speaker === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
              <p className="text-sm font-semibold mb-1">{entry.speaker === 'user' ? 'You' : 'Coach'}</p>
              <p>{entry.text}</p>
            </div>
          </div>
        ))}
        {currentInput && (
          <div className="flex justify-end">
            <div className="max-w-md p-3 rounded-lg bg-blue-600/50 text-white italic">
               <p className="text-sm font-semibold mb-1">You (transcribing...)</p>
               <p>{currentInput}</p>
            </div>
          </div>
        )}
         {currentOutput && (
          <div className="flex justify-start">
            <div className="max-w-md p-3 rounded-lg bg-gray-700/50 text-gray-200 italic">
                <p className="text-sm font-semibold mb-1">Coach (speaking...)</p>
                <p>{currentOutput}</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex-shrink-0 pt-6 text-center">
        <p className="text-gray-400 mb-4 h-6">{status}</p>
        <button
          onMouseDown={startConversation}
          onMouseUp={stopConversation}
          onTouchStart={startConversation}
          onTouchEnd={stopConversation}
          disabled={!apiKey}
          className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300
            ${isListening ? 'bg-red-600 scale-110' : 'bg-green-600 hover:bg-green-700'}
            text-white shadow-lg focus:outline-none focus:ring-4 focus:ring-opacity-50
            ${isListening ? 'focus:ring-red-500' : 'focus:ring-green-500'}
            disabled:bg-gray-600 disabled:cursor-not-allowed`}
        >
          {isListening && <span className="absolute inset-0 rounded-full bg-red-500/50 animate-ping"></span>}
          <MicrophoneIcon className="w-10 h-10" />
        </button>
      </div>
    </div>
  );
};

export default ConversationView;