export interface Utterance {
  speaker: string;
  text: string;
  [key: string]: any; 
}

export interface SpeakerMap {
  [key: string]: string;
}

export interface HistoryItem {
  id: string;
  title: string;
  date: string;
  content: string;
  utterances: any[];
  speakerNames: Record<string, string>;
  isProcessing?: boolean; 
  assemblyId?: string;
}
