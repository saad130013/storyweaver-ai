
import React, { useState } from 'react';
import { AppStep } from './types';
import { useStoryStore } from './store';
import { StoryInput } from './components/StoryInput';
import { MethodSelection } from './components/MethodSelection';
import { StoryEditor } from './components/StoryEditor';
import { PreviewAndPDF } from './components/PreviewAndPDF';
import { generateStoryFromImages } from './services/geminiService';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.INPUT);
  const [isLoading, setIsLoading] = useState(false);
  
  const { story, setScenes, addScene } = useStoryStore();

  const handleManualEntry = () => {
    addScene(); // Start with 1 empty scene
    setStep(AppStep.EDITOR);
  };

  const handleAIGeneration = async (images?: { data: string; mimeType: string }[]) => {
    if (!images || images.length === 0) return;
    
    setIsLoading(true);
    try {
      const generatedScenes = await generateStoryFromImages(
        story.title, 
        story.studentName, 
        story.languageMode,
        images
      );
      setScenes(generatedScenes);
      setStep(AppStep.EDITOR);
    } catch (error) {
      console.error(error);
      alert("AI Generation failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    switch (step) {
      case AppStep.INPUT:
        return <StoryInput onNext={() => setStep(AppStep.METHOD_SELECT)} />;
      case AppStep.METHOD_SELECT:
        return (
          <MethodSelection
            isLoading={isLoading}
            onSelectMethod={(method, images) => {
              if (method === 'MANUAL') handleManualEntry();
              else handleAIGeneration(images);
            }}
          />
        );
      case AppStep.EDITOR:
        return <StoryEditor onPreview={() => setStep(AppStep.PREVIEW)} />;
      case AppStep.PREVIEW:
        return <PreviewAndPDF onEdit={() => setStep(AppStep.EDITOR)} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
      <nav className="bg-white border-b border-slate-100 px-6 py-4 mb-8 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-violet-600 rounded-lg p-2 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
             </div>
             <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
               StoryWeaver <span className="text-violet-600">AI</span>
             </h1>
          </div>
          
          <div className="text-sm font-medium text-slate-500">
             {story.studentName && <span>Student: <span className="text-violet-600">{story.studentName}</span></span>}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
