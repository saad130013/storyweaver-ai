
import React, { useRef, useState } from 'react';
import { useStoryStore } from '../store';
import { Trash2, Plus, ArrowUp, ArrowDown, Mic, StopCircle, Wand2, ImagePlus, Sparkles, Loader2, X } from 'lucide-react';
import { Scene, SceneMedia } from '../types';
import { generateSingleScene, refineText } from '../services/geminiService';

interface StoryEditorProps {
  onPreview: () => void;
}

// Sanitization function to clean AI text
function sanitize(text: string): string {
  if (!text) return '';
  let t = text;

  // Remove control markers like PageHeader / PageFooter / PageBreak
  const CONTROL_MARKERS = [
    /<!--\s*PageHeader.*?-->/g,
    /<!--\s*PageFooter.*?-->/g,
    /<!--\s*PageBreak\s*-->/g
  ];
  CONTROL_MARKERS.forEach(rx => { t = t.replace(rx, ''); });

  // Remove weird lines or very short texts, filter empty lines
  t = t.split('\n').filter(line => line.trim().length > 1).join('\n');

  return t.trim();
}

// Helper for consistent ID generation
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `scene-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export const StoryEditor: React.FC<StoryEditorProps> = ({ onPreview }) => {
  const { story, addScene, removeScene, updateScene, reorderScenes, setAudio } = useStoryStore();
  
  // Refs for file inputs
  const changeMediaInputRef = useRef<HTMLInputElement>(null);
  const addSceneInputRef = useRef<HTMLInputElement>(null);

  // State to track which scene/image is being updated
  // If mediaIndex is -1, it means we are ADDING a new image to the scene
  const [activeMediaTarget, setActiveMediaTarget] = useState<{sceneId: string, mediaIndex: number} | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // State for specific text field refining (Translation/Fixing)
  const [refiningState, setRefiningState] = useState<{sceneId: string, field: 'narrative' | 'dialogue'} | null>(null);

  // Audio Recording State
  const [recordingSceneId, setRecordingSceneId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Helper to process/resize file
  const processMediaFile = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        
        // If video, return as is (no resize)
        if (file.type.startsWith('video')) {
          resolve(result);
          return;
        }

        // If image, resize to 800x800
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 800;
          canvas.height = 800;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, 800, 800);
            resolve(canvas.toDataURL(file.type));
          } else {
            resolve(result); // Fallback
          }
        };
        img.onerror = () => resolve(result); // Fallback
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
  };

  // --- 1. Logic for Changing/Adding Media of Existing Scene ---
  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeMediaTarget) {
      const result = await processMediaFile(file);
      const type = file.type.startsWith('video') ? 'video' : 'image';
      
      const scene = story.scenes.find(s => s.id === activeMediaTarget.sceneId);
      if (scene) {
        const newMediaList = [...scene.media];
        const newMediaItem: SceneMedia = { url: result, type };

        if (activeMediaTarget.mediaIndex === -1) {
          // Adding new media
          newMediaList.push(newMediaItem);
        } else {
          // Replacing existing media
          newMediaList[activeMediaTarget.mediaIndex] = newMediaItem;
        }
        
        updateScene(activeMediaTarget.sceneId, 'media', newMediaList);
      }
    }
    // Reset inputs
    if (changeMediaInputRef.current) changeMediaInputRef.current.value = '';
    setActiveMediaTarget(null);
  };

  const triggerChangeMedia = (sceneId: string, index: number) => {
    setActiveMediaTarget({ sceneId, mediaIndex: index });
    changeMediaInputRef.current?.click();
  };

  const triggerAddSecondMedia = (sceneId: string) => {
    setActiveMediaTarget({ sceneId, mediaIndex: -1 }); // -1 indicates Append
    changeMediaInputRef.current?.click();
  };

  const removeMediaItem = (sceneId: string, index: number) => {
    // Removed confirm check to ensure button works immediately and avoids browser blocking issues
    const scene = story.scenes.find(s => s.id === sceneId);
    if (scene) {
      const newMediaList = scene.media.filter((_, i) => i !== index);
      updateScene(sceneId, 'media', newMediaList);
    }
  };

  // --- 2. Logic for Adding New Scene via Upload (with AI) ---
  const handleNewSceneFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const type = file.type.startsWith('video') ? 'video' : 'image';
      const result = await processMediaFile(file);
      await handleNewSceneUpload(result, type);
    }
    // Reset input
    if (addSceneInputRef.current) addSceneInputRef.current.value = '';
  };

  const handleNewSceneUpload = async (mediaUrl: string, mediaType: 'image' | 'video') => {
    setIsAnalyzing(true);
    
    // Create new scene immediately
    const newScene: Scene = {
      id: generateId(),
      media: [{ url: mediaUrl, type: mediaType }],
      narrative: '',
      dialogue: '',
      isAiGenerated: false,
    };
    addScene(newScene);

    // Call AI for text generation (only for images currently)
    if (mediaType === 'image') {
      try {
        // Extract base64 and mimeType from data URL
        const [header, base64Data] = mediaUrl.split(',');
        const mimeType = header.split(':')[1].split(';')[0];
        
        const aiText = await generateSingleScene(
          { data: base64Data, mimeType },
          { 
            title: story.title, 
            studentName: story.studentName, 
            languageMode: story.languageMode 
          },
          story.scenes.length + 1
        );

        // Sanitize and update text
        updateScene(newScene.id, 'narrative', sanitize(aiText.narrative));
        updateScene(newScene.id, 'dialogue', sanitize(aiText.dialogue));
        updateScene(newScene.id, 'isAiGenerated', true);
      } catch (err) {
        console.error("AI Generation failed for new scene", err);
        updateScene(newScene.id, 'narrative', "Could not generate text. Please try again or write manually.");
      }
    }
    setIsAnalyzing(false);
  };

  // --- 3. Text Refinement / Translation ---
  const handleRefineText = async (sceneId: string, field: 'narrative' | 'dialogue', currentText: string) => {
    if (!currentText.trim()) return;
    
    setRefiningState({ sceneId, field });
    try {
      const refinedText = await refineText(currentText, field, story.languageMode);
      updateScene(sceneId, field, refinedText);
    } catch (err) {
      console.error("Refine text failed", err);
    } finally {
      setRefiningState(null);
    }
  };

  // --- Audio Recording Logic ---
  const startRecording = async (sceneId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(blob);
        setAudio(sceneId, audioUrl);
        setRecordingSceneId(null);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecordingSceneId(sceneId);
    } catch (err) {
      console.error("Audio recording failed", err);
      alert("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  // For bilingual mode, we still want RTL since Arabic comes first
  const textDir = (story.languageMode === 'ar' || story.languageMode === 'bilingual') ? 'rtl' : 'ltr';

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 pb-32">
      {/* Hidden Inputs */}
      <input type="file" ref={changeMediaInputRef} className="hidden" onChange={handleMediaChange} accept="image/*,video/*" />
      <input type="file" ref={addSceneInputRef} className="hidden" onChange={handleNewSceneFile} accept="image/*,video/*" />

      {story.scenes.map((scene, index) => {
        return (
          <div key={scene.id} className="bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden relative transition-all hover:shadow-xl">
            {/* Header */}
            <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="bg-slate-800 text-white w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm">
                  {index + 1}
                </span>
                <span className="font-bold text-slate-700">Scene {index + 1}</span>
                {scene.isAiGenerated && (
                  <span className="bg-violet-100 text-violet-700 text-xs px-2 py-1 rounded-full flex items-center gap-1 font-bold">
                    <Wand2 size={12} /> AI
                  </span>
                )}
                
                {/* Reorder Controls */}
                <div className="flex gap-1 ml-4">
                  <button 
                    type="button"
                    disabled={index === 0}
                    onClick={() => reorderScenes(index, index - 1)}
                    className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button 
                    type="button"
                    disabled={index === story.scenes.length - 1}
                    onClick={() => reorderScenes(index, index + 1)}
                    className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
              </div>

              <button 
                type="button"
                onClick={() => {
                   // Direct delete, no confirm
                   removeScene(scene.id);
                }}
                className="text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Media Column */}
              <div className="col-span-1 flex flex-col gap-4">
                {/* Media List Display */}
                <div className="flex flex-col gap-3">
                   {scene.media.map((mediaItem, mIdx) => (
                      <div key={mediaItem.url} className="h-[150px] w-full bg-[#f5f5f5] rounded-xl overflow-hidden relative group border-2 border-slate-200 hover:border-violet-400 transition-colors shadow-md">
                        {mediaItem.type === 'video' ? (
                          <video src={mediaItem.url} className="w-full h-full object-contain" controls />
                        ) : (
                          <img src={mediaItem.url} alt={`Scene ${index} media ${mIdx}`} className="w-full h-full object-contain" />
                        )}
                        
                        <div className="absolute inset-0 bg-black/40 flex flex-col gap-2 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            type="button"
                            onClick={() => triggerChangeMedia(scene.id, mIdx)}
                            className="bg-white text-slate-900 px-3 py-1 rounded-full font-bold text-xs shadow-lg transform hover:scale-105 transition-all"
                          >
                            Change
                          </button>
                          {scene.media.length > 1 && (
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeMediaItem(scene.id, mIdx);
                              }}
                              className="bg-red-500 text-white px-3 py-1 rounded-full font-bold text-xs shadow-lg transform hover:scale-105 transition-all flex items-center gap-1"
                            >
                              <X size={12} /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                   ))}

                   {/* Add Second Image Button (if less than 2) */}
                   {scene.media.length < 2 && (
                     <button
                        type="button"
                        onClick={() => triggerAddSecondMedia(scene.id)}
                        className="w-full h-12 border-2 border-dashed border-violet-300 rounded-xl flex items-center justify-center text-violet-600 gap-2 hover:bg-violet-50 transition-colors font-bold text-sm"
                     >
                        <Plus size={16} /> Add Second Image
                     </button>
                   )}
                </div>
                
                {/* Audio Recording */}
                <div className="flex gap-2">
                  {!recordingSceneId && !scene.audioUrl && (
                    <button 
                      type="button"
                      onClick={() => startRecording(scene.id)}
                      className="flex-1 py-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-violet-50 hover:text-violet-600 hover:border-violet-200 transition-all flex items-center justify-center gap-2 text-sm font-semibold"
                    >
                      <Mic size={16} /> Record
                    </button>
                  )}
                  
                  {recordingSceneId === scene.id && (
                    <button 
                      type="button"
                      onClick={stopRecording}
                      className="flex-1 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl animate-pulse flex items-center justify-center gap-2 text-sm font-semibold"
                    >
                      <StopCircle size={16} /> Stop
                    </button>
                  )}

                  {scene.audioUrl && (
                    <div className="flex-1 flex gap-2">
                      <audio src={scene.audioUrl} controls className="w-full h-8" />
                      <button 
                         type="button"
                         onClick={() => { if(confirm("Delete recording?")) setAudio(scene.id, ''); }}
                         className="p-1 text-red-400 hover:bg-red-50 rounded"
                      >
                         <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Text Inputs Column */}
              <div className="col-span-1 md:col-span-2 space-y-4">
                
                {/* Narrative Input */}
                <div className="relative group/input">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Narrative</label>
                    <button
                      type="button"
                      onClick={() => handleRefineText(scene.id, 'narrative', scene.narrative)}
                      disabled={!scene.narrative.trim() || !!refiningState}
                      className="flex items-center gap-1 text-xs font-bold text-violet-500 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded transition-all disabled:opacity-30"
                      title={story.languageMode === 'bilingual' ? "Auto-Translate & Format" : "Improve Text"}
                    >
                      {refiningState?.sceneId === scene.id && refiningState?.field === 'narrative' ? (
                         <Loader2 size={12} className="animate-spin" />
                      ) : (
                         <Sparkles size={12} />
                      )}
                      {story.languageMode === 'bilingual' ? 'Translate/Fix' : 'Improve'}
                    </button>
                  </div>
                  <textarea
                    dir={textDir}
                    className={`w-full p-3 bg-slate-50 border-2 rounded-xl focus:bg-white transition-all outline-none resize-none h-32 text-slate-800 leading-relaxed border-slate-100 focus:border-violet-400
                      ${(story.languageMode === 'ar' || story.languageMode === 'bilingual') ? 'font-arabic' : ''}
                    `}
                    value={scene.narrative}
                    onChange={(e) => updateScene(scene.id, 'narrative', e.target.value)}
                    placeholder={story.languageMode === 'ar' ? "اكتب وصف المشهد هنا..." : "Write the scene narrative here. Click 'Translate/Fix' to auto-translate."}
                  />
                </div>

                {/* Dialogue Input */}
                <div className="relative group/input">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dialogue</label>
                    <button
                      type="button"
                      onClick={() => handleRefineText(scene.id, 'dialogue', scene.dialogue)}
                      disabled={!scene.dialogue.trim() || !!refiningState}
                      className="flex items-center gap-1 text-xs font-bold text-violet-500 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded transition-all disabled:opacity-30"
                      title={story.languageMode === 'bilingual' ? "Auto-Translate & Format" : "Improve Text"}
                    >
                       {refiningState?.sceneId === scene.id && refiningState?.field === 'dialogue' ? (
                         <Loader2 size={12} className="animate-spin" />
                      ) : (
                         <Sparkles size={12} />
                      )}
                      {story.languageMode === 'bilingual' ? 'Translate/Fix' : 'Improve'}
                    </button>
                  </div>
                  <textarea
                    dir={textDir}
                    className={`w-full p-3 bg-violet-50/50 border-2 border-violet-100 rounded-xl focus:bg-white focus:border-violet-400 transition-all outline-none resize-none h-24 text-slate-800 leading-relaxed
                       ${(story.languageMode === 'ar' || story.languageMode === 'bilingual') ? 'font-arabic' : ''}
                    `}
                    value={scene.dialogue}
                    onChange={(e) => updateScene(scene.id, 'dialogue', e.target.value)}
                    placeholder={story.languageMode === 'ar' ? "سعد: مرحبا...\nريم: أهلاً..." : "Saad: Hello... (Write here and click Translate/Fix)"}
                  />
                </div>

              </div>
            </div>
          </div>
        );
      })}
      
      {/* Loading Indicator for AI Analysis */}
      {isAnalyzing && (
        <div className="fixed inset-0 bg-white/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-500 border-t-transparent mb-4"></div>
          <p className="text-violet-700 font-bold text-xl animate-pulse">Analyzing new image with AI...</p>
        </div>
      )}

      {/* Main Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6">
        <button 
          type="button"
          onClick={() => addSceneInputRef.current?.click()}
          className="w-full py-6 border-2 border-dashed border-violet-300 rounded-3xl text-violet-600 font-bold text-lg hover:bg-violet-50 transition-all flex items-center justify-center gap-2 group shadow-sm hover:shadow-md"
        >
          <div className="bg-violet-100 text-violet-600 rounded-full p-2 group-hover:bg-violet-500 group-hover:text-white transition-colors">
            <ImagePlus size={24} />
          </div>
          Add Media Scene (Auto-Write)
        </button>

        <button 
          type="button"
          onClick={() => addScene()}
          className="w-full py-6 border-2 border-dashed border-slate-300 rounded-3xl text-slate-500 font-bold text-lg hover:border-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 group"
        >
          <div className="bg-slate-200 text-white rounded-full p-2 group-hover:bg-slate-400 transition-colors">
            <Plus size={24} />
          </div>
          Add Empty Scene
        </button>
      </div>

      <div className="flex justify-center pt-8">
        <button 
          type="button"
          onClick={onPreview} 
          className="px-12 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-xl rounded-2xl shadow-xl shadow-violet-200 hover:shadow-2xl hover:-translate-y-1 transition-all"
        >
          Preview & Export Story
        </button>
      </div>
    </div>
  );
};
