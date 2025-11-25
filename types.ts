
export interface SceneMedia {
  url: string;
  type: 'image' | 'video';
}

export interface Scene {
  id: string;
  media: SceneMedia[]; // Array of media items
  narrative: string; // Combined text based on language mode
  dialogue: string; // Combined text based on language mode
  isAiGenerated: boolean;
  audioUrl?: string; // Optional per-scene recording
}

export interface Story {
  studentName: string;
  grade: string;
  schoolName: string;
  title: string;
  languageMode: 'ar' | 'bilingual'; // Arabic-only or Arabic+English
  scenes: Scene[];
}

export enum AppStep {
  INPUT = 'INPUT',
  METHOD_SELECT = 'METHOD_SELECT',
  EDITOR = 'EDITOR',
  PREVIEW = 'PREVIEW',
}
