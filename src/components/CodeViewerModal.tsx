import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useFocusTrap } from '../a11y';
import { apiFetch } from '../api';

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
  // El contenido del código se carga vía fetch desde GET /api/source (lista)
  // y GET /api/source/<file> (contenido) — ver data.ts (CODE_FILES queda vacío).
  const [fileList, setFileList] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, onClose);

  // Cargar lista de archivos al abrir el modal
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setFileList([]);
    setSelectedFile('');
    setFileContent('');
    setErrorMsg(null);
    setLoading(true);

    (async () => {
      try {
        const res = await apiFetch('/api/source');
        if (res.status === 403 || res.status === 404) {
          if (!cancelled) setErrorMsg('Desactivado (EXPOSE_SOURCE=false) o requiere admin');
          return;
        }
        if (!res.ok) {
          if (!cancelled) setErrorMsg(`Error al listar el código fuente (HTTP ${res.status})`);
          return;
        }
        const data = await res.json().catch(() => null);
        // Acepta ["a.py", ...] o {files: [...]} según la forma que devuelva Flask.
        const files: string[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.files)
            ? data.files
            : [];
        if (!cancelled) {
          setFileList(files);
          if (files.length > 0) setSelectedFile(files[0]);
        }
      } catch {
        if (!cancelled) setErrorMsg('No se pudo contactar con el servidor (/api/source).');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen]);

  // Cargar contenido del archivo seleccionado
  useEffect(() => {
    if (!isOpen || !selectedFile) return;
    let cancelled = false;
    setLoading(true);
    setFileContent('');

    (async () => {
      try {
        const res = await apiFetch(`/api/source/${encodeURIComponent(selectedFile)}`);
        if (res.status === 403 || res.status === 404) {
          if (!cancelled) setErrorMsg('Desactivado (EXPOSE_SOURCE=false) o requiere admin');
          return;
        }
        if (!res.ok) {
          if (!cancelled) setErrorMsg(`Error al cargar ${selectedFile} (HTTP ${res.status})`);
          return;
        }
        const data = await res.json().catch(() => null);
        const content = typeof data === 'string'
          ? data
          : data?.content ?? data?.code ?? '';
        if (!cancelled) setFileContent(String(content));
      } catch {
        if (!cancelled) setErrorMsg(`No se pudo cargar ${selectedFile}.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, selectedFile]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-mono">
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        className="bg-[#1E2023] border border-[#2A2C30] rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="bg-[#232528] px-5 py-4 border-b border-[#2A2C30] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#E5E5E5] uppercase tracking-wider">
              Código Fuente Python — Orchestration Engine (platform/phonefarm/)
            </h3>
          </div>
          <button onClick={onClose} className="text-[#9CA1A8] hover:text-[#E5E5E5] font-bold text-sm p-1">✕</button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar file selector */}
          <div className="w-56 bg-[#1A1C1E] border-r border-[#2A2C30] p-2.5 overflow-y-auto space-y-1 text-xs">
            {fileList.length === 0 && !loading && !errorMsg && (
              <span className="block px-3 py-2 text-[#6B7076]">Sin archivos</span>
            )}
            {fileList.map((filename) => (
              <button
                key={filename}
                onClick={() => setSelectedFile(filename)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors font-mono ${
                  selectedFile === filename
                    ? 'bg-[#8A8F98] text-[#1E2023] font-bold'
                    : 'text-[#9CA1A8] hover:bg-white/5 hover:text-[#E5E5E5]'
                }`}
              >
                {filename}
              </button>
            ))}
          </div>

          {/* Main Code View */}
          <div className="flex-1 flex flex-col bg-[#232528] overflow-hidden">
            <div className="bg-[#1A1C1E] px-4 py-2.5 border-b border-[#2A2C30] flex items-center justify-between text-xs">
              <span className="text-[#A1A6AE] font-bold">{selectedFile || '(ningún archivo)'}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!fileContent}
                  className="bg-[#33363A] hover:bg-[#3A3D42] text-[#E5E5E5] border border-[#2A2C30] px-2.5 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  {copied ? 'Copiado!' : 'Copiar Código'}
                </button>
                <button
                  onClick={() => onDownloadFile(selectedFile, fileContent)}
                  disabled={!selectedFile}
                  className="bg-[#8A8F98] hover:bg-[#8A8F98]/90 text-[#1E2023] font-bold px-3 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50"
                > Descargar {selectedFile}
                </button>
              </div>
            </div>

            {errorMsg ? (
              <div className="flex-1 flex items-center justify-center p-6 bg-[#232528]">
                <span className="text-xs text-[#E05B5B] font-mono">{errorMsg}</span>
              </div>
            ) : loading && !fileContent ? (
              <div className="flex-1 flex items-center justify-center p-6 bg-[#232528]">
                <span className="text-xs text-[#9CA1A8] font-mono uppercase tracking-widest">Cargando código fuente...</span>
              </div>
            ) : (
              <pre className="flex-1 p-4 overflow-auto text-xs text-[#E5E5E5] leading-relaxed bg-[#232528]">
                <code>{fileContent}</code>
              </pre>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
