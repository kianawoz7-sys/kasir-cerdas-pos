import React from 'react';
import { toast } from 'react-hot-toast';

export const customConfirm = (message: string, isDestructive = true): Promise<boolean> => {
  return new Promise((resolve) => {
    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[200px]">
        <p className="font-bold text-sm text-slate-800">{message}</p>
        <div className="flex gap-2 justify-end mt-2">
          <button 
            onClick={() => {
              toast.dismiss(t.id);
              resolve(false);
            }} 
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button 
            onClick={() => {
              toast.dismiss(t.id);
              resolve(true);
            }} 
            className={`px-4 py-2 text-xs font-bold text-white rounded-lg transition-colors ${
              isDestructive 
                ? 'bg-rose-500 hover:bg-rose-600' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Ya, Lanjutkan
          </button>
        </div>
      </div>
    ), { 
      duration: Infinity,
      position: 'top-center',
    });
  });
};
