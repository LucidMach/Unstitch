import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Plus, FolderOpen, Trash2, Box, FileCode, Upload, AlertCircle, Share2, Mail, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from './button';

interface DialogProps {
  show: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ show, onClose, children }) => (
  <AnimatePresence>
    {show && (
      <div 
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
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
  onExportJSON?: () => void;
  onExportGLTF?: () => void;
}> = ({ show, onClose, projectName, setProjectName, onSave, currentProjectId, projects, onExportJSON, onExportGLTF }) => (
  <Dialog show={show} onClose={onClose}>
    <div className="p-5 sm:p-6 space-y-4 overflow-y-auto max-h-[85vh]">
      <div className="flex justify-between items-center pb-3 border-b border-neutral-100">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Save Design</h3>
          <p className="text-xs text-neutral-500">Choose how you want to save your creation</p>
        </div>
        <button 
          onClick={onClose} 
          className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="space-y-3.5">
        {/* Option 1: Save to Browser */}
        <div className="p-3.5 bg-neutral-50/80 rounded-xl border border-neutral-200/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 shadow-xs">
                <FolderOpen size={13} />
              </div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900">1. Save to Browser</h4>
            </div>
            <span className="text-[10px] text-neutral-400 font-mono">Local Storage</span>
          </div>
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            Store in your browser for instant loading and future editing sessions.
          </p>

          {currentProjectId && (
            <Button 
              onClick={() => onSave(true)}
              className="w-full bg-neutral-900 hover:bg-black text-white rounded-lg py-2 font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs transition-all"
            >
              <Save size={13} />
              <span>Update "{projects.find(p => p.id === currentProjectId)?.name}"</span>
            </Button>
          )}

          <div className="flex gap-2">
            <input 
              autoFocus={!currentProjectId}
              type="text" 
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSave(false)}
              placeholder="e.g. Hex Weave Origami"
              className="flex-1 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#A36E93] focus:ring-1 focus:ring-[#A36E93] transition-all placeholder:text-neutral-400"
            />
            <Button 
              onClick={() => onSave(false)} 
              className="bg-[#A36E93] hover:bg-[#8e5c80] text-white rounded-lg px-3.5 py-2 font-bold text-xs uppercase tracking-wider flex items-center gap-1 shadow-xs transition-all shrink-0"
            >
              <Plus size={14} />
              <span>Save</span>
            </Button>
          </div>
        </div>

        {/* Option 2: Save Locally */}
        {onExportJSON && (
          <div 
            onClick={() => { onExportJSON(); onClose(); }}
            className="group p-3.5 bg-neutral-50/80 hover:bg-neutral-100 rounded-xl border border-neutral-200/80 hover:border-neutral-400 cursor-pointer transition-all space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 shadow-xs group-hover:scale-105 transition-transform">
                  <FileCode size={13} />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900">2. Save Locally</h4>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-neutral-200/80 text-neutral-700 font-bold">.JSON</span>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Download your design file with all nodes and fold angles. Re-import anytime.
            </p>
          </div>
        )}

        {/* Option 3: Save to CAD */}
        {onExportGLTF && (
          <div 
            onClick={() => { onExportGLTF(); onClose(); }}
            className="group p-3.5 bg-neutral-50/80 hover:bg-neutral-100 rounded-xl border border-neutral-200/80 hover:border-[#A36E93] cursor-pointer transition-all space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-[#A36E93] shadow-xs group-hover:scale-105 transition-transform">
                  <Box size={13} />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900">3. Save to CAD</h4>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#eedfe9] text-[#A36E93] border border-[#A36E93]/20 font-bold">.GLB</span>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Export 3D mesh model ready for Blender, 3D printing, CAD, and rendering.
            </p>
          </div>
        )}
      </div>
    </div>
  </Dialog>
);

export const ShareDialog: React.FC<{
  show: boolean;
  onClose: () => void;
  projectName: string;
  setProjectName: (name: string) => void;
  designData: any;
  previewImage: string | null;
  onShareSuccess?: () => void;
}> = ({ show, onClose, projectName, setProjectName, designData, previewImage, onShareSuccess }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const tileCount = Array.isArray(designData?.tiles) ? designData.tiles.length : 1;
  const foldCount = Array.isArray(designData?.tiles) 
    ? designData.tiles.filter((t: any) => Math.abs(t.foldAngle || 0) > 0.01).length 
    : 0;

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Safety guard: ensure total payload string size stays well below serverless limits (3.5MB threshold)
      let safePreviewImage = previewImage || undefined;
      const initialPayload = JSON.stringify({
        email: email.trim(),
        projectName: projectName.trim() || 'Unstitch 3D Creation',
        designData,
        previewImage: safePreviewImage,
      });

      // If payload is somehow oversized (> 3MB), omit preview image to ensure the 3D model JSON file delivers safely
      if (initialPayload.length > 3 * 1024 * 1024) {
        console.warn('Share payload exceeded safe size limit; omitting high-res preview snapshot.');
        safePreviewImage = undefined;
      }

      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          projectName: projectName.trim() || 'Unstitch 3D Creation',
          designData,
          previewImage: safePreviewImage,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Endpoint /api/share not recognized. Please restart your dev server (pnpm dev).');
        }
        if (res.status === 413) {
          throw new Error('The creation data is too large for the mail server (Payload Too Large). Try sharing a slightly smaller assembly.');
        }
        throw new Error(data.error || `Failed to send email (status ${res.status}). Please try again.`);
      }

      setIsSuccess(true);
      onShareSuccess?.();
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong while sending the email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog show={show} onClose={onClose}>
      <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
        <div className="flex justify-between items-center pb-3 border-b border-neutral-100">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Share Creation</h3>
            <p className="text-xs text-neutral-500">Email yourself the 3D model JSON & preview</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#eedfe9] text-[#A36E93] flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <h4 className="text-sm font-bold text-neutral-900">Design Emailed Successfully!</h4>
            <p className="text-xs text-neutral-500 max-w-xs mx-auto">
              Check your inbox at <strong>{email}</strong> for your 3D model file and render preview.
            </p>
          </div>
        ) : (
          <form onSubmit={handleShare} className="space-y-4">
            {/* 3D Snapshot & Metadata Preview */}
            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-2.5">
              {previewImage && (
                <div className="aspect-[16/9] w-full bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200/60 flex items-center justify-center">
                  <img src={previewImage} alt="3D Creation Preview" className="w-full h-full object-contain" />
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] text-neutral-600 px-1 font-mono">
                <span>{tileCount} {tileCount === 1 ? 'Tile' : 'Tiles'}</span>
                <span>{foldCount} Active {foldCount === 1 ? 'Fold' : 'Folds'}</span>
                <span>.JSON Attached</span>
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                  Project Title
                </label>
                <input 
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Hex Origami Assembly"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs text-neutral-900 focus:outline-none focus:border-[#A36E93] focus:ring-2 focus:ring-[#A36E93]/20 transition-all placeholder:text-neutral-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                  Your Email Address *
                </label>
                <div className="relative">
                  <input 
                    autoFocus
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-neutral-900 focus:outline-none focus:border-[#A36E93] focus:ring-2 focus:ring-[#A36E93]/20 transition-all placeholder:text-neutral-400"
                  />
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <Button 
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#A36E93] hover:bg-[#8e5c80] text-white rounded-xl py-3 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Sending Creation...</span>
                </>
              ) : (
                <>
                  <Share2 size={15} />
                  <span>Email My Creation</span>
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </Dialog>
  );
};

export const LoadDialog: React.FC<{
  show: boolean;
  onClose: () => void;
  projects: any[];
  onLoad: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onImportJSON?: (data: any) => void;
}> = ({ show, onClose, projects, onLoad, onDelete, onImportJSON }) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        onImportJSON?.(json);
      } catch (err) {
        console.error("Failed to parse design file", err);
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog show={show} onClose={onClose}>
      <div className="p-5 border-b border-neutral-100 flex justify-between items-center bg-white sticky top-0 z-10">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Saved Projects</h3>
          <p className="text-xs text-neutral-500">Select a project to load into canvas</p>
        </div>
        <button 
          onClick={onClose} 
          className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[50vh]">
        {projects.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-11 h-11 bg-neutral-100 rounded-full flex items-center justify-center mx-auto text-neutral-400">
              <FolderOpen size={20} />
            </div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">No saved projects found</p>
          </div>
        ) : (
          projects.map((p) => (
            <div 
              key={p.id}
              onClick={() => onLoad(p.id)}
              className="group flex items-center justify-between p-3.5 bg-neutral-50/70 hover:bg-neutral-100 rounded-xl border border-neutral-200/80 hover:border-neutral-400 cursor-pointer transition-all"
            >
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-neutral-900 group-hover:text-neutral-950 transition-colors">{p.name}</h4>
                <p className="text-[11px] text-neutral-400 font-mono">
                  {new Date(p.timestamp).toLocaleDateString()} · {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button 
                onClick={(e) => onDelete(p.id, e)}
                title="Delete project"
                className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-80 sm:opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      {onImportJSON && (
        <div className="p-4 border-t border-neutral-100 bg-neutral-50/60">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".json,application/json" 
            className="hidden" 
          />
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-semibold uppercase tracking-wider py-2.5 rounded-xl border border-neutral-200 flex items-center justify-center gap-2 shadow-sm transition-all"
          >
            <Upload size={14} />
            Import .JSON File
          </Button>
        </div>
      )}
    </Dialog>
  );
};

export const ExportDialog: React.FC<{
  show: boolean;
  onClose: () => void;
  onExportJSON: () => void;
  onExportGLTF: () => void;
}> = ({ show, onClose, onExportJSON, onExportGLTF }) => (
  <Dialog show={show} onClose={onClose}>
    <div className="p-6 space-y-5">
      <div className="flex justify-between items-center pb-3 border-b border-neutral-100">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Export Model</h3>
          <p className="text-xs text-neutral-500">Choose an export format for your textile assembly</p>
        </div>
        <button 
          onClick={onClose} 
          className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <button 
          onClick={() => { onExportJSON(); onClose(); }}
          className="group flex items-start gap-3.5 p-4 rounded-xl border border-neutral-200 bg-neutral-50/60 hover:bg-neutral-100 hover:border-neutral-400 text-left transition-all"
        >
          <div className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-neutral-800 shadow-sm shrink-0 group-hover:scale-105 transition-transform">
            <FileCode size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-bold text-neutral-900">Unstitch Project</h4>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-neutral-200/80 text-neutral-700 font-semibold">.JSON</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Full kinematic hierarchy, nodes & fold angles. Re-importable anytime.
            </p>
          </div>
        </button>

        <button 
          onClick={() => { onExportGLTF(); onClose(); }}
          className="group flex items-start gap-3.5 p-4 rounded-xl border border-neutral-200 bg-neutral-50/60 hover:bg-neutral-100 hover:border-[#A36E93] text-left transition-all"
        >
          <div className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-[#A36E93] shadow-sm shrink-0 group-hover:scale-105 transition-transform">
            <Box size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-bold text-neutral-900">3D CAD Asset</h4>
              <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-[#eedfe9] text-[#A36E93] border border-[#A36E93]/20 font-bold">.GLB</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Standard 3D mesh ready for Blender, 3D printing, CAD, and rendering.
            </p>
          </div>
        </button>
      </div>
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
    <div className="p-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${confirmVariant === "destructive" ? "bg-red-50 text-red-600" : "bg-neutral-100 text-neutral-700"}`}>
            {icon || (confirmVariant === "destructive" ? <AlertCircle size={18} /> : <Trash2 size={18} />)}
          </div>
          <h3 className="text-base font-bold text-neutral-900 leading-tight">{title}</h3>
        </div>
        <p className="text-xs text-neutral-600 leading-relaxed">{message}</p>
        <div className="flex gap-2.5 pt-2">
          <Button 
            variant="secondary" 
            className="flex-1 h-10 rounded-xl text-xs font-semibold uppercase tracking-wider bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-none transition-all" 
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button 
            variant={confirmVariant} 
            className={`flex-1 h-10 rounded-xl text-xs font-semibold uppercase tracking-wider text-white border-none transition-all shadow-sm ${confirmVariant === "destructive" ? "bg-red-600 hover:bg-red-700" : "bg-neutral-900 hover:bg-black"}`} 
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  </Dialog>
);
