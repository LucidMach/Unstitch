import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Plus, FolderOpen, Trash2 } from 'lucide-react';
import { Button } from './button';

interface DialogProps {
  show: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ show, onClose, children }) => (
  <AnimatePresence>
    {show && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden flex flex-col"
        >
          {children}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export const SaveDialog: React.FC<{
  show: boolean;
  onClose: () => void;
  projectName: string;
  setProjectName: (name: string) => void;
  onSave: (isUpdate: boolean) => void;
  currentProjectId: string | null;
  projects: any[];
}> = ({ show, onClose, projectName, setProjectName, onSave, currentProjectId, projects }) => (
  <Dialog show={show} onClose={onClose}>
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800">Save Project</h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
          <X size={20} />
        </button>
      </div>
      <div className="space-y-4">
        {currentProjectId && (
          <Button 
            onClick={() => onSave(true)}
            className="w-full bg-zinc-800 hover:bg-black text-white rounded-xl py-6 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2"
          >
            <Save size={16} />
            Update "{projects.find(p => p.id === currentProjectId)?.name}"
          </Button>
        )}
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
            {currentProjectId ? "Or Save as New Project" : "Project Name"}
          </label>
          <div className="flex gap-2">
            <input 
              autoFocus={!currentProjectId}
              type="text" 
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSave(false)}
              placeholder="Enter name..."
              className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all"
            />
            <Button onClick={() => onSave(false)} className="bg-pink-500 hover:bg-pink-600 text-white rounded-xl px-4 font-bold">
              <Plus size={20} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
);

export const LoadDialog: React.FC<{
  show: boolean;
  onClose: () => void;
  projects: any[];
  onLoad: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}> = ({ show, onClose, projects, onLoad, onDelete }) => (
  <Dialog show={show} onClose={onClose}>
    <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-white sticky top-0 z-10">
      <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800">Your Projects</h3>
      <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
        <X size={20} />
      </button>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[60vh]">
      {projects.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto text-zinc-300">
            <FolderOpen size={24} />
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">No saved projects</p>
        </div>
      ) : (
        projects.map((p) => (
          <div 
            key={p.id}
            onClick={() => onLoad(p.id)}
            className="group flex items-center justify-between p-4 bg-zinc-50 hover:bg-pink-50 rounded-2xl border border-zinc-100 hover:border-pink-200 cursor-pointer transition-all"
          >
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-zinc-800 group-hover:text-pink-600 transition-colors">{p.name}</h4>
              <p className="text-[10px] text-zinc-400 font-medium">
                {new Date(p.timestamp).toLocaleDateString()} at {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button 
              onClick={(e) => onDelete(p.id, e)}
              className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-100 sm:opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))
      )}
    </div>
  </Dialog>
);

export const ConfirmDialog: React.FC<{
  show: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: "destructive" | "secondary";
  onConfirm: () => void;
  onCancel: () => void;
  icon?: React.ReactNode;
}> = ({ show, title, message, confirmLabel, confirmVariant = "destructive", onConfirm, onCancel, icon }) => (
  <Dialog show={show} onClose={onCancel}>
    <div className="p-7 max-w-96 w-full">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${confirmVariant === "destructive" ? "bg-red-50 text-red-500" : "bg-zinc-100 text-zinc-600"}`}>
            {icon || <Trash2 size={20} />}
          </div>
          <h3 className="text-lg font-bold text-zinc-900 leading-tight">{title}</h3>
        </div>
        <p className="text-sm text-zinc-600 leading-relaxed px-1">{message}</p>
        <div className="flex gap-2.5 pt-1">
          <Button variant="secondary" className="flex-1 h-11 rounded-xl text-sm font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-none transition-all" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={confirmVariant} className={`flex-1 h-11 rounded-xl text-sm font-semibold text-white border-none transition-all shadow-sm ${confirmVariant === "destructive" ? "bg-red-500 hover:bg-red-600" : "bg-pink-500 hover:bg-pink-600"}`} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  </Dialog>
);
