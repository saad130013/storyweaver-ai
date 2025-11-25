
import React from 'react';
import { useStoryStore } from '../store';

interface StoryInputProps {
  onNext: () => void;
}

export const StoryInput: React.FC<StoryInputProps> = ({ onNext }) => {
  const { story, setStoryMeta } = useStoryStore();

  const isFormValid = story.studentName.trim() !== '' && story.title.trim() !== '';

  return (
    <div className="w-full max-w-3xl mx-auto bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
      <div className="space-y-6">
        
        {/* Language Toggle */}
        <div className="flex justify-center mb-6">
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
            <button
              onClick={() => setStoryMeta({ languageMode: 'bilingual' })}
              className={`px-6 py-2 rounded-lg font-bold transition-all ${
                story.languageMode === 'bilingual' 
                  ? 'bg-white text-violet-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Bilingual (عربي/Eng)
            </button>
            <button
              onClick={() => setStoryMeta({ languageMode: 'ar' })}
              className={`px-6 py-2 rounded-lg font-bold transition-all ${
                story.languageMode === 'ar' 
                  ? 'bg-white text-violet-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Arabic Only (عربي فقط)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-slate-600 font-bold mb-2 text-lg">Student Name (Required)</label>
            <input
              type="text"
              className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-violet-500 outline-none text-lg"
              value={story.studentName}
              onChange={(e) => setStoryMeta({ studentName: e.target.value })}
              placeholder="e.g. Sarah"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-2 text-lg">Grade</label>
            <input
              type="text"
              className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-violet-500 outline-none text-lg"
              value={story.grade}
              onChange={(e) => setStoryMeta({ grade: e.target.value })}
              placeholder="e.g. 3rd Grade"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-2 text-lg">School</label>
            <input
              type="text"
              className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-violet-500 outline-none text-lg"
              value={story.schoolName}
              onChange={(e) => setStoryMeta({ schoolName: e.target.value })}
              placeholder="e.g. Andalus Schools"
            />
          </div>
        </div>

        <div>
          <label className="block text-slate-600 font-bold mb-2 text-lg">Story Title (Required)</label>
          <input
            type="text"
            className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-violet-500 outline-none text-lg"
            value={story.title}
            onChange={(e) => setStoryMeta({ title: e.target.value })}
            placeholder="e.g. The Brave Lion"
          />
        </div>

        <button
          onClick={onNext}
          disabled={!isFormValid}
          className={`w-full py-4 mt-6 rounded-2xl text-xl font-bold text-white transition-all transform hover:scale-[1.01] active:scale-[0.99]
            ${isFormValid ? 'bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg' : 'bg-slate-300 cursor-not-allowed'}
          `}
        >
          Next Step
        </button>
      </div>
    </div>
  );
};
