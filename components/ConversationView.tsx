import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob, Part } from '@google/genai';
import { Language, ChatMessage, BreakdownEntry } from '../types';
import { MicrophoneIcon, StopIcon, PauseIcon } from './icons';
import { encode, decode, decodeAudioData } from '../utils/audio';
import WordBreakdownModal from './WordBreakdownModal';


type RecordingState = 'idle' | 'connecting' | 'recording' | 'paused';

interface ConversationViewProps {
  language: Language;
  systemInstruction: string;
}

const ConversationView: React.FC<ConversationViewProps> = ({ language, systemInstruction }) => {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcriptionHistory, setTranscriptionHistory] = useState<ChatMessage[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const currentInputRef = useRef('');
  const currentOutputRef = useRef(''); // For the full formatted text response
  const currentLiveOutputRef = useRef(''); // For the live audio transcript

  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const recordingStateRef = useRef(recordingState);
  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  const handleOpenModal = (message: ChatMessage) => {
    if (message.breakdown && message.breakdown.length > 0) {
      setSelectedMessage(message);
      setIsModalOpen(true);
    }
  };

  const stopConversation = useCallback(() => {
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
    
    setRecordingState('idle');

  }, []);

  const pauseRecording = useCallback(() => {
    if (scriptProcessorRef.current && mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect(scriptProcessorRef.current);
        setRecordingState('paused');
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (scriptProcessorRef.current && mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
        setRecordingState('recording');
    }
  }, []);

  const startConversation = useCallback(async () => {
    if (recordingState !== 'idle') {
      return;
    }
    
    setTranscriptionHistory([]);
    setCurrentInput('');
    setCurrentOutput('');
    currentInputRef.current = '';
    currentOutputRef.current = '';
    currentLiveOutputRef.current = '';
    setError(null);
    setRecordingState('connecting');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: language === Language.JAPANESE ? 'Kore' : 'Zephyr' } } },
          systemInstruction: systemInstruction,
        },
        callbacks: {
          onopen: async () => {
            setRecordingState('recording');
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
              currentLiveOutputRef.current += message.serverContent.outputTranscription.text;
              setCurrentOutput(currentLiveOutputRef.current);
            }
            
            const modelTurnParts = message.serverContent?.modelTurn?.parts;
            if (modelTurnParts) {
                for (const part of modelTurnParts) {
                    if ((part as Part).text) {
                        currentOutputRef.current += (part as Part).text;
                    }
                }
            }
            
            if (message.serverContent?.turnComplete) {
              const fullInput = currentInputRef.current.trim();
              const formattedText = currentOutputRef.current.trim();
              const liveTranscript = currentLiveOutputRef.current.trim();

              const newEntries: ChatMessage[] = [];
              if (fullInput) {
                newEntries.push({ role: 'user', text: fullInput });
              }

              if (liveTranscript) {
                 const modelMessage: ChatMessage = { role: 'model', text: liveTranscript };

                 // Enhance with formatted data if available (for Japanese)
                 if (formattedText && language === Language.JAPANESE) {
                    const parts = formattedText.split('---');
                    modelMessage.text = parts[0]?.trim() || liveTranscript;

                    const romajiMatch = formattedText.match(/Romaji:\s*(.*)/m);
                    if (romajiMatch) modelMessage.romaji = romajiMatch[1].trim();

                    const breakdownMatch = formattedText.match(/Breakdown:\s*([\s\S]*)/m);
                    if (breakdownMatch && breakdownMatch[1]) {
                        const breakdownLines = breakdownMatch[1].trim().split('\n');
                        modelMessage.breakdown = breakdownLines.map(line => {
                            const [word, romaji, spanish] = line.split('|').map(s => s.trim());
                            return { word, romaji, spanish };
                        }).filter(b => b.word && b.romaji && b.spanish);
                    }
                 }
                 newEntries.push(modelMessage);
              }
              
              if (newEntries.length > 0) {
                setTranscriptionHistory(prev => [...prev, ...newEntries]);
              }

              currentInputRef.current = '';
              currentOutputRef.current = '';
              currentLiveOutputRef.current = '';
              setCurrentInput('');
              setCurrentOutput('');
            }

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              if (recordingStateRef.current === 'recording') {
                pauseRecording();
              }
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
            setError(`Error: ${e.message}`);
            stopConversation();
          },
          onclose: () => {
             setRecordingState('idle');
          },
        },
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      console.error("Failed to start conversation:", err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error: ${errorMessage}`);
      setRecordingState('idle');
    }
  }, [recordingState, systemInstruction, stopConversation, language, pauseRecording]);

  useEffect(() => {
    return () => {
      stopConversation();
    };
  }, [stopConversation]);

  const handlePrimaryButtonClick = () => {
    switch (recordingState) {
      case 'idle':
        startConversation();
        break;
      case 'recording':
        pauseRecording();
        break;
      case 'paused':
        resumeRecording();
        break;
    }
  };

  const getStatusText = () => {
    switch (recordingState) {
      case 'idle': return 'Presiona el botón para hablar.';
      case 'connecting': return 'Conectando...';
      case 'recording': return 'Grabando... Presiona para pausar.';
      case 'paused': return 'Pausado. Presiona para reanudar.';
      default: return '';
    }
  };

  const getPrimaryButtonIcon = () => {
    switch (recordingState) {
        case 'idle':
        case 'paused':
            return <MicrophoneIcon className="w-10 h-10" />;
        case 'recording':
            return <PauseIcon className="w-10 h-10" />;
        case 'connecting':
            return <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>;
    }
  };

  const renderCurrentOutput = () => {
    if (!currentOutput) return null;
    return (
        <div className="flex justify-start">
            <div className="max-w-md p-3 rounded-lg bg-gray-700/50 text-gray-200 italic">
                <p className="text-sm font-semibold mb-1">Coach (speaking...)</p>
                <p>{currentOutput}</p>
            </div>
        </div>
    );
  };

  return (
    <>
    <WordBreakdownModal isOpen={isModalOpen} message={selectedMessage} onClose={() => setIsModalOpen(false)} />
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-800 rounded-2xl shadow-2xl p-6">
      <div className="flex-grow overflow-y-auto pr-4 space-y-4">
        {transcriptionHistory.map((entry, index) => (
          <div key={index} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
               onClick={() => entry.role === 'model' && handleOpenModal(entry)}
              className={`max-w-md p-3 rounded-lg ${entry.role === 'user' ? 'bg-blue-600 text-white' : `bg-gray-700 text-gray-200 ${entry.breakdown ? 'cursor-pointer hover:bg-gray-600' : ''}`}`}>
              <p className="text-sm font-semibold mb-1">{entry.role === 'user' ? 'You' : 'Coach'}</p>
              <p>{entry.text}</p>
              {entry.role === 'model' && entry.romaji && (
                <p className="pt-2 mt-2 border-t border-gray-600 text-sm text-gray-400 font-mono tracking-wide">
                  {entry.romaji}
                </p>
              )}
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
         {currentOutput && renderCurrentOutput()}
      </div>
      <div className="flex-shrink-0 pt-6 text-center">
        <p className="text-gray-400 mb-4 h-6">{error || getStatusText()}</p>
        <div className="flex items-center justify-center gap-6 h-24">
            { (recordingState === 'recording' || recordingState === 'paused') && (
                <button
                    onClick={stopConversation}
                    className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg transition-all focus:outline-none focus:ring-4 focus:ring-red-500 focus:ring-opacity-50"
                    aria-label="Stop recording"
                >
                    <StopIcon className="w-8 h-8" />
                </button>
            )}
            <button
            onClick={handlePrimaryButtonClick}
            disabled={recordingState === 'connecting'}
            className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300
                ${recordingState === 'recording' ? 'bg-blue-600' : 'bg-green-600 hover:bg-green-700'}
                ${recordingState === 'paused' ? 'scale-110' : ''}
                text-white shadow-lg focus:outline-none focus:ring-4 focus:ring-opacity-50
                ${recordingState === 'recording' ? 'focus:ring-blue-500' : 'focus:ring-green-500'}
                disabled:bg-gray-600 disabled:cursor-not-allowed`}
            >
            {recordingState === 'recording' && <span className="absolute inset-0 rounded-full bg-blue-500/50 animate-ping"></span>}
            {getPrimaryButtonIcon()}
            </button>
        </div>
      </div>
    </div>
    </>
  );
};

export default ConversationView;