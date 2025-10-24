import React from 'react';
import { ChatMessage } from '../types';

interface WordBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: ChatMessage | null;
}

const JapaneseText: React.FC<{ text: string }> = ({ text }) => {
  // Fix: Use React.ReactNode[] type to resolve "Cannot find namespace 'JSX'" error.
  const finalElements: React.ReactNode[] = [];
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
      <ruby key={`modal-ruby-${i++}`} className="text-sky-300">
        {base}
        <rt className="text-sky-400/80">{furigana}</rt>
      </ruby>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    finalElements.push(text.substring(lastIndex));
  }

  return <>{finalElements}</>;
};

const WordBreakdownModal: React.FC<WordBreakdownModalProps> = ({ isOpen, onClose, message }) => {
  if (!isOpen || !message || !message.breakdown) return null;

  return (
    <div 
        className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4"
        onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-5 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">Análisis de la Oración</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">&times;</button>
        </header>
        
        <div className="p-6 bg-gray-800/50 rounded-lg text-lg text-center flex-shrink-0">
             <JapaneseText text={message.text} />
        </div>

        <div className="overflow-y-auto flex-grow p-6">
          <table className="w-full text-left table-auto">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="border-b border-gray-600 text-sm text-gray-400 uppercase">
                <th className="p-3">Palabra</th>
                <th className="p-3">Romaji</th>
                <th className="p-3">Significado (Español)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {message.breakdown.map((item, index) => (
                <tr key={index} className="hover:bg-gray-700/50">
                  <td className="p-3 font-semibold text-lg text-sky-300"><JapaneseText text={item.word} /></td>
                  <td className="p-3 font-mono text-gray-300">{item.romaji}</td>
                  <td className="p-3 text-gray-300">{item.spanish}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <footer className="p-4 border-t border-gray-700 text-right flex-shrink-0">
            <button 
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
                Cerrar
            </button>
        </footer>
      </div>
    </div>
  );
};

export default WordBreakdownModal;
