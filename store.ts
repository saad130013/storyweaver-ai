
import { create } from 'zustand';
import { Scene, Story } from './types';

interface StoryState {
  story: Story;
  setStoryMeta: (meta: Partial<Story>) => void;
  setScenes: (scenes: Scene[]) => void;
  
  // Scene Actions
  addScene: (scene?: Scene) => void;
  removeScene: (sceneId: string) => void;
  updateScene: (sceneId: string, field: keyof Scene, value: any) => void;
  reorderScenes: (startIndex: number, endIndex: number) => void;
  setAudio: (sceneId: string, audioUrl: string) => void;
}

// Robust ID generator to prevent duplicate IDs which break delete functionality
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `scene-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export const useStoryStore = create<StoryState>((set) => ({
  story: {
    studentName: '',
    grade: '',
    schoolName: '',
    title: '',
    languageMode: 'bilingual',
    scenes: [],
  },

  setStoryMeta: (meta) => set((state) => ({
    story: { ...state.story, ...meta }
  })),

  setScenes: (scenes) => set((state) => ({
    story: { ...state.story, scenes }
  })),

  addScene: (scene) => set((state) => ({
    story: {
      ...state.story,
      scenes: [...state.story.scenes, scene || {
        id: generateId(),
        media: [{ 
          url: `https://picsum.photos/seed/${Date.now()}/800/800`, 
          type: 'image' 
        }],
        narrative: '',
        dialogue: '',
        isAiGenerated: false
      }]
    }
  })),

  removeScene: (sceneId) => set((state) => ({
    story: {
      ...state.story,
      scenes: state.story.scenes.filter((s) => s.id !== sceneId)
    }
  })),

  updateScene: (sceneId, field, value) => set((state) => ({
    story: {
      ...state.story,
      scenes: state.story.scenes.map((s) => 
        s.id === sceneId ? { ...s, [field]: value } : s
      )
    }
  })),

  reorderScenes: (startIndex, endIndex) => set((state) => {
    const result = Array.from(state.story.scenes);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return { story: { ...state.story, scenes: result } };
  }),

  setAudio: (sceneId, audioUrl) => set((state) => ({
    story: {
      ...state.story,
      scenes: state.story.scenes.map((s) => 
        s.id === sceneId ? { ...s, audioUrl } : s
      )
    }
  })),
}));
