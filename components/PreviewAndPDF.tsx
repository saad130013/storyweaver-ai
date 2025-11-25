
import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import { useStoryStore } from '../store';
import { Scene, SceneMedia } from '../types';
import { translateText } from '../services/geminiService';
import { BookOpen } from 'lucide-react';

interface PreviewProps {
  onEdit: () => void;
}

const FOOTER_TEXT = "حقوق البرنامج محفوظة - ديم سعد البقمي - الصف الثالث ابتدائي - مدارس الاندلس الاهلية الحمدانية";

// Constants for styling
const COLORS = {
  background: "#F5EEDC", // Warm Beige
  text: "#3B3B3B",       // Dark Grey
  dialogue: "#581c87",   // Deep Royal Purple
  dialogueHex: "581c87" // Purple 900 for PPT
};

// --- Helpers ---

// 1. Sanitize text removing AI markers
const cleanText = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/<!--.*?-->/g, '') // Remove HTML comments
    .replace(/\*\*/g, '')       // Remove markdown bold
    .trim();
};

// 2. Parse [EN] bilingual tags
const parseText = (text: string) => {
  const clean = cleanText(text);
  const parts = clean.split('[EN]');
  return {
    ar: parts[0]?.trim() || '',
    en: parts[1]?.trim() || null
  };
};

// 3. Generate Video Thumbnail from Blob URL
const getVideoThumbnail = async (videoUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    video.muted = true;
    video.currentTime = 1; 

    const onLoaded = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; 
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(''); 
      }
      video.remove();
    };

    video.onseeked = onLoaded;
    video.onerror = () => resolve(''); 
    video.load();
  });
};

// --- Components for PDF Layout ---

// Auto-Scaling Text Container
const FitTextContainer: React.FC<{ 
  narrative: { ar: string; en: string | null };
  dialogue: { ar: string; en: string | null };
}> = ({ narrative, dialogue }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Reset scale to measure true height
    container.style.transform = 'scale(1)';
    
    // Calculate available height in the A4 page
    // A4 height = 297mm (~1122px). 
    // Padding Top (40px) + Image (350px) + Gap (60px) + Footer Area (80px) + Padding Bottom (40px) ≈ 570px used.
    // Available ~550px. 
    const availableHeight = 550; 
    const contentHeight = container.scrollHeight;

    if (contentHeight > availableHeight) {
      const newScale = availableHeight / contentHeight;
      // Limit shrink to 60% to remain readable
      setScale(Math.max(newScale, 0.6)); 
    } else {
      setScale(1);
    }
  }, [narrative, dialogue]);

  return (
    <div className="flex-grow w-full flex flex-col justify-start relative overflow-hidden">
      <div 
        ref={containerRef}
        style={{ 
          transform: `scale(${scale})`, 
          transformOrigin: 'top center',
          width: '100%' 
        }}
        className="space-y-5 px-1"
      >
        {/* Narrative Section - Soft White Transparent Box */}
        {(narrative.ar || narrative.en) && (
          <div className="p-6 bg-white/60 rounded-[2rem] border border-white/50 shadow-sm relative">
            {narrative.ar && (
              <p 
                className="font-arabic font-bold whitespace-pre-wrap leading-loose text-right"
                dir="rtl"
                style={{ fontSize: '14px', color: COLORS.text }}
              >
                {narrative.ar}
              </p>
            )}
            {narrative.en && (
              <p 
                className="font-sans whitespace-pre-wrap leading-relaxed text-left mt-3 pt-3 border-t border-slate-200/50"
                dir="ltr"
                style={{ fontSize: '14px', color: COLORS.text }}
              >
                {narrative.en}
              </p>
            )}
          </div>
        )}

        {/* Dialogue Section - Soft Violet Transparent Box */}
        {(dialogue.ar || dialogue.en) && (
          <div className="p-6 bg-purple-100/40 rounded-[2rem] border border-purple-200/40 shadow-sm relative">
            {dialogue.ar && (
              <p 
                className="font-arabic font-bold whitespace-pre-wrap leading-loose text-right"
                dir="rtl"
                style={{ fontSize: '14px', color: COLORS.dialogue }}
              >
                {dialogue.ar}
              </p>
            )}
            {dialogue.en && (
              <p 
                className="font-sans whitespace-pre-wrap leading-relaxed text-left mt-3 pt-3 border-t border-purple-200/30"
                dir="ltr"
                style={{ fontSize: '14px', color: COLORS.dialogue }}
              >
                {dialogue.en}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper component to render a single media item (image or video placeholder)
const MediaItem: React.FC<{ item: SceneMedia; className?: string }> = ({ item, className }) => {
  if (item.type === 'video') {
    return (
      <div className={`bg-slate-900 flex items-center justify-center text-white rounded-2xl shadow-lg ${className}`}>
        <span className="text-4xl">▶️</span>
      </div>
    );
  }
  return (
    <img 
      src={item.url} 
      className={`rounded-xl shadow-lg ${className}`}
      style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
      alt="Scene Media"
    />
  );
};

export const PreviewAndPDF: React.FC<PreviewProps> = ({ onEdit }) => {
  const { story } = useStoryStore();
  const pagesRef = useRef<(HTMLDivElement | null)[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingType, setLoadingType] = useState<'PDF' | 'PPT' | null>(null);
  
  const [displayScenes, setDisplayScenes] = useState<Scene[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);

  // --- Effect: Prepare Content (Auto-Translate) ---
  useEffect(() => {
    const prepareContent = async () => {
      if (story.languageMode === 'bilingual') {
        setDisplayScenes(story.scenes);
        return;
      }

      setIsTranslating(true);
      try {
        const processedScenes = await Promise.all(
          story.scenes.map(async (scene) => {
            let newNarrative = scene.narrative;
            let newDialogue = scene.dialogue;

            // Only translate if not already translated (simple check for [EN])
            if (scene.narrative.trim() && !scene.narrative.includes('[EN]')) {
               const trans = await translateText(scene.narrative);
               if (trans) newNarrative = `${scene.narrative}\n\n[EN] ${trans}`;
            }

            if (scene.dialogue.trim() && !scene.dialogue.includes('[EN]')) {
               const trans = await translateText(scene.dialogue);
               if (trans) newDialogue = `${scene.dialogue}\n\n[EN] ${trans}`;
            }

            return {
              ...scene,
              narrative: newNarrative,
              dialogue: newDialogue
            };
          })
        );
        setDisplayScenes(processedScenes);
      } catch (err) {
        console.error("Auto-translation failed:", err);
        setDisplayScenes(story.scenes);
      } finally {
        setIsTranslating(false);
      }
    };

    prepareContent();
  }, [story.scenes, story.languageMode]);

  // --- PDF Generation ---
  const generatePDF = async () => {
    setIsGenerating(true);
    setLoadingType('PDF');
    
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;

      const validPages = pagesRef.current.filter(Boolean);

      for (let i = 0; i < validPages.length; i++) {
        const pageEl = validPages[i]!;
        
        // Use html2canvas to capture the exact DOM layout we built
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: COLORS.background 
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        if (i > 0) doc.addPage();
        doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }

      doc.save(`${story.title.replace(/\s+/g, '_')}.pdf`);

    } catch (err) {
      console.error("PDF generation error", err);
      alert("PDF Export failed.");
    } finally {
      setIsGenerating(false);
      setLoadingType(null);
    }
  };

  // --- PPT Generation ---
  const generatePPT = async () => {
    setIsGenerating(true);
    setLoadingType('PPT');
    try {
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';
      pptx.rtlMode = true;

      // Clean hex color for PPTX (remove #)
      const bgHex = COLORS.background.replace('#', '');
      const textHex = COLORS.text.replace('#', '');
      const dialogueHex = COLORS.dialogueHex;

      // Cover
      const slide1 = pptx.addSlide();
      slide1.background = { color: bgHex };
      
      // Removed Logo as requested, now just text layout
      slide1.addText(story.title, { x: '10%', y: '30%', w: '80%', h: 1, fontSize: 44, align: 'center', bold: true, color: '000000', fontFace: 'Cairo' });
      slide1.addText(`Student: ${story.studentName}`, { x: '10%', y: '55%', w: '80%', h: 0.5, fontSize: 24, align: 'center', color: 'EA580C', fontFace: 'Cairo', bold: true });
      slide1.addText(`${story.grade} - ${story.schoolName}`, { x: '10%', y: '65%', w: '80%', h: 0.4, fontSize: 20, align: 'center', color: '475569', fontFace: 'Cairo' });
      slide1.addText(FOOTER_TEXT, { x: 0, y: '92%', w: '100%', h: 0.4, fontSize: 10, color: textHex, align: 'center', fontFace: 'Cairo' });

      // Scenes
      for (const scene of displayScenes) {
        const slide = pptx.addSlide();
        slide.background = { color: bgHex };
        slide.addText(FOOTER_TEXT, { x: 0, y: '92%', w: '100%', h: 0.4, fontSize: 10, color: textHex, align: 'center', fontFace: 'Cairo' });

        // Media
        const mediaCount = scene.media.length;
        for (let i = 0; i < mediaCount; i++) {
          const item = scene.media[i];
          let mediaData = item.url;
          
          if (item.type === 'video') {
             const thumb = await getVideoThumbnail(item.url);
             if (thumb) mediaData = thumb;
          }

          if (mediaData) {
            let xPos = '25%';
            let wSize = '50%';
            if (mediaCount === 2) {
              wSize = '45%'; 
              xPos = i === 0 ? '5%' : '50%'; 
            }
            slide.addImage({ 
              data: mediaData, 
              x: xPos as any, 
              y: '5%' as any, 
              w: wSize as any, 
              h: '45%' as any, 
              sizing: { type: 'contain', w: wSize as any, h: '45%' as any } 
            });
          }
        }

        // Parse Text for PPT
        const nar = parseText(scene.narrative);
        const dia = parseText(scene.dialogue);

        // Arabic Block (Combine Narrative and Dialogue for better flow but different colors)
        const arabicTextRuns = [];
        if (nar.ar) {
           arabicTextRuns.push({ text: nar.ar, options: { color: textHex, bold: true } });
        }
        if (dia.ar) {
           if (nar.ar) arabicTextRuns.push({ text: "\n\n", options: {} });
           arabicTextRuns.push({ text: dia.ar, options: { color: dialogueHex, bold: true } });
        }

        if (arabicTextRuns.length > 0) {
           slide.addText(arabicTextRuns, {
             x: '5%', y: '55%', w: '90%', h: '20%',
             fontSize: 14, align: 'right', fontFace: 'Cairo', rtlMode: true
           });
        }

        // English Block
        const englishTextRuns = [];
        if (nar.en) {
           englishTextRuns.push({ text: nar.en, options: { color: textHex } });
        }
        if (dia.en) {
           if (nar.en) englishTextRuns.push({ text: "\n\n", options: {} });
           englishTextRuns.push({ text: dia.en, options: { color: dialogueHex } });
        }

        if (englishTextRuns.length > 0) {
           slide.addText(englishTextRuns, {
             x: '5%', y: '75%', w: '90%', h: '15%',
             fontSize: 14, align: 'left', fontFace: 'Arial', rtlMode: false
           });
        }
      }
      await pptx.writeFile({ fileName: `${story.title}_Story.pptx` });
    } catch (err) {
      console.error(err);
      alert("PPT Export failed.");
    } finally {
      setIsGenerating(false);
      setLoadingType(null);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-8 pb-20">
      {/* Control Bar */}
      <div className="sticky top-20 z-40 bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-slate-200 flex gap-4 transition-all">
         <button onClick={onEdit} className="text-slate-600 font-bold hover:text-slate-900 px-4 py-2">
           ← Back to Editor
         </button>
         
         <button 
            onClick={generatePPT} 
            disabled={isGenerating || isTranslating}
            className="bg-orange-500 text-white px-6 py-2 rounded-xl font-bold shadow hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
         >
            {loadingType === 'PPT' ? 'Generating...' : 'Export PowerPoint'}
         </button>

         <button 
            onClick={generatePDF} 
            disabled={isGenerating || isTranslating}
            className="bg-violet-600 text-white px-6 py-2 rounded-xl font-bold shadow hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
         >
            {loadingType === 'PDF' ? 'Generating...' : 'Export PDF'}
         </button>
      </div>

      {isTranslating && (
        <div className="animate-pulse text-violet-600 font-bold">Preparing bilingual content...</div>
      )}

      {/* 
         PREVIEW CONTAINER 
         This section renders strict A4 pages for visual preview and PDF capture.
      */}
      <div className="w-full flex flex-col items-center gap-8 bg-slate-200 p-8 rounded-3xl border border-slate-300 shadow-inner overflow-auto max-h-[85vh]">
        
        {/* --- PAGE 1: COVER --- */}
        <div 
          ref={(el) => { pagesRef.current[0] = el; }}
          style={{ 
            backgroundColor: COLORS.background,
            paddingTop: '40px',
            paddingBottom: '40px',
            paddingRight: '40px',
            paddingLeft: '30px',
          }}
          className="w-[210mm] h-[297mm] shadow-md relative flex flex-col items-center text-center shrink-0 overflow-hidden"
        >
            {/* Decorative Corners */}
            <div className="absolute top-8 left-8 w-24 h-24 border-t-4 border-l-4 border-slate-400/20 rounded-tl-3xl pointer-events-none"></div>
            <div className="absolute top-8 right-8 w-24 h-24 border-t-4 border-r-4 border-slate-400/20 rounded-tr-3xl pointer-events-none"></div>
            <div className="absolute bottom-24 left-8 w-24 h-24 border-b-4 border-l-4 border-slate-400/20 rounded-bl-3xl pointer-events-none"></div>
            <div className="absolute bottom-24 right-8 w-24 h-24 border-b-4 border-r-4 border-slate-400/20 rounded-br-3xl pointer-events-none"></div>

            <div className="flex-grow flex flex-col justify-center items-center gap-8 w-full z-10">
                
                {/* Decorative Central Element instead of Logo */}
                <div className="mb-6 relative group">
                   <div className="absolute inset-0 bg-violet-400/20 rounded-full blur-2xl transform group-hover:scale-110 transition-transform duration-700"></div>
                   <div className="relative bg-white/60 p-10 rounded-full border border-white/50 shadow-sm backdrop-blur-sm">
                      <BookOpen size={100} className="text-slate-700/80" strokeWidth={1} />
                   </div>
                </div>

                <h1 className="font-arabic text-6xl font-extrabold leading-tight" dir="rtl" style={{ color: COLORS.text }}>
                  {story.title}
                </h1>
                
                <div className="w-32 h-1 bg-slate-400/30 mx-auto rounded-full my-2"></div>

                <div className="space-y-6 mt-4">
                   <h2 className="font-arabic text-4xl font-bold" style={{ color: COLORS.text }}>{story.studentName}</h2>
                   <div className="flex flex-col gap-2 opacity-80">
                      <p className="font-arabic text-2xl" style={{ color: COLORS.text }}>{story.grade}</p>
                      <p className="font-arabic text-2xl" style={{ color: COLORS.text }}>{story.schoolName}</p>
                   </div>
                </div>
            </div>

            {/* Fixed Footer */}
            <div className="absolute bottom-[40px] left-0 w-full text-center px-8 z-10">
               <div className="border-t-2 border-slate-400/30 pt-3">
                 <p className="font-arabic text-sm font-bold" style={{ color: COLORS.text }}>{FOOTER_TEXT}</p>
               </div>
            </div>
        </div>

        {/* --- SCENE PAGES (1 Scene = 1 Page) --- */}
        {displayScenes.map((scene, index) => {
          // Parse Text for DOM Rendering
          const narrativeParsed = parseText(scene.narrative);
          const dialogueParsed = parseText(scene.dialogue);

          return (
            <div 
               key={scene.id}
               ref={(el) => { pagesRef.current[index + 1] = el; }}
               style={{ 
                 backgroundColor: COLORS.background,
                 paddingTop: '40px', // Top Margin
                 paddingBottom: '40px', // Bottom Margin
                 paddingRight: '40px', // Right Margin
                 paddingLeft: '30px', // Left Margin
               }}
               className="w-[210mm] h-[297mm] shadow-md relative flex flex-col shrink-0"
            >
              {/* Image Area */}
              <div 
                className="w-full flex shrink-0"
                style={{ 
                  marginBottom: '60px', 
                  height: '350px',
                  gap: '16px',
                  justifyContent: scene.media.length === 1 ? 'center' : 'space-between'
                }} 
              >
                  {scene.media.map((item, i) => (
                    <div 
                      key={i} 
                      className={`h-full ${scene.media.length > 1 ? 'flex-1' : 'w-full'} flex items-center justify-center`}
                    >
                       <MediaItem item={item} />
                    </div>
                  ))}
              </div>

              {/* Text Area: Separated Narrative and Dialogue */}
              <FitTextContainer 
                narrative={narrativeParsed}
                dialogue={dialogueParsed}
              />

              {/* Footer */}
              <div className="absolute bottom-[40px] left-0 w-full text-center px-[30px]">
                 <div className="border-t-2 border-slate-400/30 pt-3">
                    <p className="font-arabic font-bold text-sm" style={{ color: COLORS.text }}>{FOOTER_TEXT}</p>
                 </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
        