import React, { useState } from 'react';
import { CODE_FILES } from '../data';
import { Code2, Copy, Check, FileText, Download } from 'lucide-react';

interface CodeViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownloadFile: (filename: string, content: string) => void;
}

export const CodeViewerModal: React.FC<CodeViewerModalProps> = ({
  isOpen,
  onClose,
  onDownloadFile
}) => {
  const [selectedFile, setSelectedFile] = useState<keyof typeof CODE_FILES>('platform.py');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentContent = CODE_FILES[selectedFile];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 font-mono">
      <div className="bg-[#101A2D] border border-[#1E2C42] rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-[#0F1829] px-5 py-4 border-b border-[#1E2C42] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-[#00E5BE]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Código Fuente Python — Orchestration Engine (C:\phone-farm)
            </h3>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-white font-bold text-sm p-1">✕</button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar file selector */}
          <div className="w-56 bg-[#0B1320] border-r border-[#1E2C42] p-2.5 overflow-y-auto space-y-1 text-xs">
            {Object.keys(CODE_FILES).map((filename) => (
              <button
                key={filename}
                onClick={() => setSelectedFile(filename as keyof typeof CODE_FILES)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors font-mono ${
                  selectedFile === filename
                    ? 'bg-[#00E5BE] text-[#090D16] font-bold shadow-md'
                    : 'text-[#94A3B8] hover:bg-white/5 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                {filename}
              </button>
            ))}
          </div>

          {/* Main Code View */}
          <div className="flex-1 flex flex-col bg-[#0F1829] overflow-hidden">
            <div className="bg-[#0B1320] px-4 py-2.5 border-b border-[#1E2C42] flex items-center justify-between text-xs">
              <span className="text-[#4DFFE0] font-bold">{selectedFile}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="bg-[#1E293B] hover:bg-[#334155] text-neutral-200 border border-[#1E2C42] px-2.5 py-1 rounded-lg flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#00E5BE]" /> : <Copy className="w-3.5 h-3.5 text-[#4DFFE0]" />}
                  {copied ? 'Copiado!' : 'Copiar Código'}
                </button>
                <button
                  onClick={() => onDownloadFile(selectedFile, currentContent)}
                  className="bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#090D16] font-bold px-3 py-1 rounded-lg flex items-center gap-1 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5 text-[#090D16]" /> Descargar {selectedFile}
                </button>
              </div>
            </div>

            <pre className="flex-1 p-4 overflow-auto text-xs text-neutral-200 leading-relaxed bg-[#0F1829]">
              <code>{currentContent}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
