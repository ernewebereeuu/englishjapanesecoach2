
export enum Language {
  ENGLISH = 'English',
  JAPANESE = 'Japanese',
}

export enum Mode {
  WRITTEN = 'Written',
  SPOKEN = 'Spoken',
}

export interface BreakdownEntry {
  word: string;
  romaji: string;
  spanish: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  speech?: string;
  romaji?: string;
  breakdown?: BreakdownEntry[];
}