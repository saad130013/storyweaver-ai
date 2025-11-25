
import React, { useRef } from 'react';
import { Upload } from 'lucide-react';

interface ImageFile {
  data: string;
  mimeType: string;
}

interface MethodSelectionProps {
  onSelectMethod: (method: 'AI' | 'MANUAL', images?: ImageFile[]) => void;
  isLoading: boolean;
}

// Helper to resize images to 800x800
const resizeImage = (file: File): Promise<ImageFile> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 800;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, 800, 800);
          const dataUrl = canvas.toDataURL(file.type);
          const [header, base64Data] = dataUrl.split(',');
          const mimeType = header.split(':')[1].split(';')[0];
          resolve({ data: base64Data, mimeType });
        } else {
          reject(new Error("Failed to get canvas context"));
        }
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const MethodSelection: React.FC<MethodSelectionProps> = ({ onSelectMethod, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAIUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      
      const imagePromises = files.map(file => resizeImage(file));

      Promise.all(imagePromises).then(images => {
        onSelectMethod('AI', images);
      }).catch(err => {
        console.error("Error processing images", err);
        alert("Failed to process images.");
      });
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
       <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-slate-800">How would you like to create the story?</h2>
       </div>

       {/* Hidden File Input */}
       <input 
         type="file" 
         multiple 
         accept="image/*" 
         ref={fileInputRef} 
         className="hidden" 
         onChange={handleAIUpload}
       />

       {/* AI Generator Option (Triggers Upload) */}
       <button
         onClick={() => fileInputRef.current?.click()}
         disabled={isLoading}
         className="w-full group relative overflow-hidden bg-gradient-to-r from-violet-500 to-fuchsia-500 p-1 rounded-3xl shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1"
       >
          <div className="bg-white/10 backdrop-blur-sm p-6 sm:p-8 flex items-center gap-6 h-full w-full rounded-[20px]">
             <div className="h-16 w-16 bg-white/20 rounded-full flex items-center justify-center text-white shrink-0">
                <Upload size={32} />
             </div>
             <div className="text-left">
                <h3 className="text-2xl font-bold text-white mb-1">Generate from Photos</h3>
                <p className="text-violet-100 font-medium text-lg">Upload photos & let AI write the story</p>
             </div>
             {isLoading && (
               <div className="absolute inset-0 bg-violet-600/80 flex items-center justify-center backdrop-blur-sm z-10">
                 <div className="animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent"></div>
               </div>
             )}
          </div>
       </button>

       {/* Manual Option */}
       <button
         onClick={() => onSelectMethod('MANUAL')}
         disabled={isLoading}
         className="w-full group bg-white border-2 border-slate-200 p-6 sm:p-8 rounded-3xl flex items-center gap-6 shadow-sm hover:border-violet-400 hover:shadow-lg transition-all"
       >
          <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-violet-50 group-hover:text-violet-600 transition-colors shrink-0">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
               <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
             </svg>
          </div>
          <div className="text-left">
             <h3 className="text-2xl font-bold text-slate-800 mb-1">Write Manually</h3>
             <p className="text-slate-500 font-medium text-lg">I will write the text myself</p>
          </div>
       </button>
    </div>
  );
};
