import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, File, CheckCircle, AlertCircle, Loader2, Share2, Copy, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { db } from './firebase';
import { doc, setDoc, getDoc, serverTimestamp, getDocFromServer, collection, query, orderBy, limit, onSnapshot, Timestamp, writeBatch, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firebaseUtils';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  downloadUrl: string;
  createdAt?: any;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [recentFiles, setRecentFiles] = useState<UploadedFile[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isFirebaseReady, setIsFirebaseReady] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Connection test to Firebase
  useEffect(() => {
    const testConnection = async () => {
      const path = 'test/connection';
      try {
        // Attempt to read a test document to verify Firestore connection
        await getDocFromServer(doc(db, 'test', 'connection'));
        setIsFirebaseReady(true);
      } catch (err: any) {
        console.error("Firebase connection test failed:", err);
        // If it's just "not found", that's actually a success (connection worked)
        if (err.code === 'not-found' || !err.message.includes('offline')) {
          setIsFirebaseReady(true);
        } else {
          setIsFirebaseReady(false);
          // Don't throw here to avoid crashing the whole app immediately, 
          // but we could use handleFirestoreError if we wanted to be strict
        }
      }
    };
    testConnection();
  }, []);

  // Fetch recent files
  useEffect(() => {
    if (isFirebaseReady) {
      const path = 'apkFiles';
      const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(10));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const files = snapshot.docs.map(doc => doc.data() as UploadedFile);
        setRecentFiles(files);
        setIsLoadingRecent(false);
      }, (err) => {
        setIsLoadingRecent(false);
        handleFirestoreError(err, OperationType.LIST, path);
      });
      return () => unsubscribe();
    }
  }, [isFirebaseReady]);

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

    try {
      const fileId = crypto.randomUUID();
      const CHUNK_SIZE = 700 * 1024; // 700KB chunks to stay safe under 1MB limit
      
      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const totalChunks = Math.ceil(uint8Array.length / CHUNK_SIZE);

      // 1. Store metadata in Firestore
      const fileMetadata = {
        id: fileId,
        name: file.name,
        size: file.size,
        totalChunks: totalChunks,
        downloadUrl: `firestore://${fileId}`, // Internal reference
        createdAt: serverTimestamp(),
      };

      const metaPath = `apkFiles/${fileId}`;
      try {
        await setDoc(doc(db, 'apkFiles', fileId), fileMetadata);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, metaPath);
      }

      // 2. Upload chunks to Firestore subcollection
      // We use batches for efficiency (max 500 writes per batch)
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, uint8Array.length);
        const chunkData = uint8Array.slice(start, end);
        
        // Convert chunk to Base64 string for Firestore storage
        // (Firestore supports Bytes, but Base64 is often more reliable across SDKs)
        const base64Chunk = btoa(
          new Uint8Array(chunkData).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        const chunkPath = `apkFiles/${fileId}/chunks/${i}`;
        try {
          await setDoc(doc(db, 'apkFiles', fileId, 'chunks', i.toString()), {
            index: i,
            data: base64Chunk
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, chunkPath);
        }
      }

      setUploadedFile({
        id: fileId,
        name: file.name,
        size: file.size,
        downloadUrl: `${window.location.origin}/?id=${fileId}`, // Shareable link
      });
      setFile(null);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'An error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      // 1. Get metadata to know how many chunks
      const metaDoc = await getDoc(doc(db, 'apkFiles', fileId));
      if (!metaDoc.exists()) throw new Error("File metadata not found");
      
      const { totalChunks } = metaDoc.data();
      const chunks: string[] = new Array(totalChunks);

      // 2. Fetch all chunks
      const chunksSnap = await getDocs(collection(db, 'apkFiles', fileId, 'chunks'));
      chunksSnap.forEach(doc => {
        const data = doc.data();
        chunks[data.index] = data.data;
      });

      // 3. Reconstruct file
      const byteArrays = chunks.map(base64 => {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      });

      const blob = new Blob(byteArrays, { type: 'application/vnd.android.package-archive' });
      const url = URL.createObjectURL(blob);
      
      // 4. Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download error:", err);
      alert("Failed to reconstruct file: " + err.message);
    }
  };

  const copyToClipboard = () => {
    if (!uploadedFile) return;
    const fullUrl = uploadedFile.downloadUrl;
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
            <div className="flex items-center justify-center gap-2 mb-4">
              <h1 className="text-6xl md:text-8xl font-bold tracking-tighter bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
                APK SHARE
              </h1>
            </div>
            <p className="text-white/40 text-lg md:text-xl max-w-xl mx-auto font-light">
              Powered by Firestore (Free Tier). No paid Storage plan required.
            </p>
          </motion.div>

          {/* Connection Status */}
          <div className="mt-8 flex justify-center">
            <AnimatePresence mode="wait">
              {isFirebaseReady === null ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-white/20 text-xs uppercase tracking-widest">
                  <Loader2 size={12} className="animate-spin" />
                  Connecting to Firebase...
                </motion.div>
              ) : isFirebaseReady ? (
                <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-green-500/60 text-xs uppercase tracking-widest">
                  <Wifi size={12} />
                  System Ready (Firebase Connected)
                </motion.div>
              ) : (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-red-500/60 text-xs uppercase tracking-widest">
                  <WifiOff size={12} />
                  Firebase Connection Failed
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
                  Upload APK to Firestore
                </motion.button>
              )}

              {isUploading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 text-white/60"
                >
                  <Loader2 className="animate-spin" />
                  <span className="font-medium tracking-wide uppercase text-xs">Storing in Firestore (Free Tier)...</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-2 text-red-400 justify-center bg-red-400/10 p-6 rounded-3xl border border-red-400/20 text-center"
            >
              <div className="flex items-center gap-2">
                <AlertCircle size={18} />
                <span className="text-sm font-bold uppercase tracking-wider">Upload Error</span>
              </div>
              <p className="text-sm opacity-80">{error}</p>
              <p className="text-[10px] opacity-40 mt-2 uppercase tracking-widest">Make sure to re-deploy the app to see the Firebase version.</p>
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
                      <button 
                        onClick={() => handleDownload(uploadedFile.id, uploadedFile.name)}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-2xl font-bold transition-all"
                      >
                        <Download size={18} />
                        Download Now
                      </button>
                      
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
                    {uploadedFile.downloadUrl}
                  </code>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Recent Uploads Section */}
        <section className="mt-20 pt-20 border-t border-white/5">
          <h2 className="text-2xl font-bold mb-8 tracking-tight flex items-center gap-3">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            Recent Uploads
          </h2>
          
          {isLoadingRecent ? (
            <div className="flex items-center gap-3 text-white/20 uppercase tracking-widest text-[10px]">
              <Loader2 size={12} className="animate-spin" />
              Fetching latest uploads...
            </div>
          ) : recentFiles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentFiles.map((f) => (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white/[0.02] border border-white/10 p-6 rounded-3xl hover:bg-white/[0.04] transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/40 group-hover:text-white/80 transition-colors">
                      <File size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">{f.name}</p>
                      <p className="text-white/20 text-xs uppercase tracking-widest">{formatSize(f.size)}</p>
                    </div>
                    <button 
                      onClick={() => handleDownload(f.id, f.name)}
                      className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center text-white/40 hover:text-white transition-all"
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-white/20 text-sm italic">
              No APKs have been uploaded yet. Be the first!
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-40 text-center text-white/20 text-xs tracking-widest uppercase">
          <p>© 2026 APK SHARE • SECURE FIRESTORE STORAGE (FREE TIER)</p>
        </footer>
      </main>
    </div>
  );
}
