import React, { useState, useRef } from 'react';
import { Upload, Download, File, CheckCircle, AlertCircle, Loader2, Share2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  downloadUrl: string;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [copied, setCopied] = useState(false);
  const [isBackendMissing, setIsBackendMissing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if backend is available
  React.useEffect(() => {
    fetch('/api/health').catch(() => {
      setIsBackendMissing(true);
    });
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith('.apk')) {
        setError('Please select a valid .apk file.');
        setFile(null);
        return;
      }
      setError(null);
      setFile(selectedFile);
      setUploadedFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('apk', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      setUploadedFile(data);
      setFile(null);
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const copyToClipboard = () => {
    if (!uploadedFile) return;
    const fullUrl = `${window.location.origin}${uploadedFile.downloadUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-20">
        {/* Header */}
        <header className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-4 bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
              APK SHARE
            </h1>
            <p className="text-white/40 text-lg md:text-xl max-w-xl mx-auto font-light">
              Fast, secure, and simple APK sharing. Upload your file and get a link instantly.
            </p>
          </motion.div>

          {isBackendMissing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-8 p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl text-orange-400 text-sm max-w-lg mx-auto"
            >
              <p className="font-bold mb-1">⚠️ Backend Unavailable</p>
              <p className="opacity-80">This app requires a Node.js server to handle uploads. It looks like you're running on a static host (like Netlify) where the server is not active.</p>
            </motion.div>
          )}
        </header>

        {/* Upload Section */}
        <section className="space-y-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative group"
          >
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative z-10 border-2 border-dashed rounded-3xl p-12 md:p-20 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-6",
                file ? "border-orange-500/50 bg-orange-500/5" : "border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04]"
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".apk"
                className="hidden"
              />
              
              <div className={cn(
                "w-20 h-20 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110",
                file ? "bg-orange-500 text-white shadow-[0_0_30px_rgba(249,115,22,0.4)]" : "bg-white/5 text-white/40"
              )}>
                {file ? <CheckCircle size={32} /> : <Upload size={32} />}
              </div>

              <div className="text-center">
                <p className="text-xl font-medium mb-1">
                  {file ? file.name : "Drop your APK here"}
                </p>
                <p className="text-white/40 text-sm">
                  {file ? formatSize(file.size) : "Maximum file size: 100MB"}
                </p>
              </div>
            </div>
            
            {/* Decorative border glow */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-blue-500 rounded-3xl opacity-0 group-hover:opacity-20 blur transition duration-500 pointer-events-none" />
          </motion.div>

          <div className="flex justify-center">
            <AnimatePresence mode="wait">
              {file && !isUploading && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onClick={handleUpload}
                  className="px-10 py-4 bg-white text-black rounded-full font-bold text-lg hover:scale-105 active:scale-95 transition-all shadow-[0_10px_30px_rgba(255,255,255,0.2)]"
                >
                  Upload APK
                </motion.button>
              )}

              {isUploading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 text-white/60"
                >
                  <Loader2 className="animate-spin" />
                  <span className="font-medium tracking-wide uppercase text-xs">Uploading to cloud...</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-red-400 justify-center bg-red-400/10 py-3 rounded-xl border border-red-400/20"
            >
              <AlertCircle size={18} />
              <span className="text-sm font-medium">{error}</span>
            </motion.div>
          )}
        </section>

        {/* Result Section */}
        <AnimatePresence>
          {uploadedFile && (
            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-20 pt-20 border-t border-white/5"
            >
              <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-8 md:p-12">
                <div className="flex flex-col md:flex-row items-center gap-8">
                  <div className="w-24 h-24 bg-blue-500/20 rounded-3xl flex items-center justify-center text-blue-400">
                    <File size={40} />
                  </div>
                  
                  <div className="flex-1 text-center md:text-left">
                    <h3 className="text-2xl font-bold mb-1">{uploadedFile.name}</h3>
                    <p className="text-white/40 mb-6">{formatSize(uploadedFile.size)}</p>
                    
                    <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                      <a 
                        href={uploadedFile.downloadUrl}
                        download
                        className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-2xl font-bold transition-all"
                      >
                        <Download size={18} />
                        Download Now
                      </a>
                      
                      <button 
                        onClick={copyToClipboard}
                        className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-bold transition-all"
                      >
                        {copied ? <CheckCircle size={18} className="text-green-400" /> : <Copy size={18} />}
                        {copied ? "Copied!" : "Copy Link"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-10 p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center gap-4 overflow-hidden">
                  <Share2 size={16} className="text-white/20 shrink-0" />
                  <code className="text-white/40 text-sm truncate select-all">
                    {window.location.origin}{uploadedFile.downloadUrl}
                  </code>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="mt-40 text-center text-white/20 text-xs tracking-widest uppercase">
          <p>© 2026 APK SHARE • SECURE FILE TRANSFER</p>
        </footer>
      </main>
    </div>
  );
}
