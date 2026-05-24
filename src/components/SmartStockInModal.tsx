import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, UploadCloud, Trash2, CheckCircle2, AlertCircle, Plus, Search } from 'lucide-react';

const parseNumber = (val: string | number) => {
  return Number(String(val).replace(/\D/g, "")) || 0;
};

const formatNumber = (val: number | string) => {
  return Number(val || 0).toLocaleString("id-ID");
};
import { GoogleGenerativeAI } from '@google/generative-ai';
import { toast } from 'react-hot-toast';
import Fuse from 'fuse.js';
import { Barang } from '../types';
import { posService } from '../services/posService';

interface Props {
  onClose: () => void;
  inventory: Barang[];
}

export const SmartStockInModal: React.FC<Props> = ({ onClose, inventory }) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedItems, setExtractedItems] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Mobile-first UI states
  const [focusedInput, setFocusedInput] = useState<{ index: number, field: string } | null>(null);
  const [pickerTarget, setPickerTarget] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPickerItems = useMemo(() => {
    if (!searchQuery.trim()) return inventory;
    const query = searchQuery.toLowerCase();
    return inventory.filter(item => 
      item.nama_barang.toLowerCase().includes(query) || 
      (item.aliases && item.aliases.some((alias: string) => alias.toLowerCase().includes(query)))
    );
  }, [inventory, searchQuery]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("File harus berupa gambar.", { id: 'file-type-error' });
        return;
      }
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
      setExtractedItems([]); // Reset previous data
    }
  };

  const handleClearImage = () => {
    setImagePreview(null);
    setSelectedFile(null);
    setExtractedItems([]);
  };

  const compressImage = async (file: File): Promise<{ data: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Scale down if too large (max 1000px)
        const MAX_WIDTH = 1000;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Cannot get canvas context"));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export to JPEG with 0.7 quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const base64Data = dataUrl.split(',')[1];
        resolve({ data: base64Data, mimeType: 'image/jpeg' });
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const processReceiptWithAI = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setExtractedItems([]);
    toast.loading('Menganalisis nota dengan AI...', { id: 'ocr-toast' });

    try {
      const compressedData = await compressImage(selectedFile);
      const imagePart = { inlineData: compressedData };

      // Initialize Gemini Vision API
      const genAI = new GoogleGenerativeAI((import.meta as any).env.VITE_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = "Anda adalah AI asisten toko grosir. Baca nota ini dan ekstrak daftar barangnya. Kembalikan HANYA format JSON valid berupa array of objects. Jangan ada teks markdown lain. Struktur object: { rawName: string (nama di nota), qty: number, buyPrice: number (harga total item ini) }.";

      const result = await model.generateContent([prompt, imagePart]);

      const responseText = result.response.text();

      // Robust JSON Parsing: Strip any markdown blocks
      let cleanJson = responseText.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```/, '');
      }
      if (cleanJson.endsWith('```')) {
        cleanJson = cleanJson.replace(/```$/, '');
      }
      cleanJson = cleanJson.trim();

      const parsedData = JSON.parse(cleanJson);
      if (Array.isArray(parsedData)) {
        // Fuse matching
        const fuse = new Fuse(inventory, {
          keys: ['nama_barang', 'aliases'],
          includeScore: true,
          threshold: 0.6,
        });

        const enrichedData = parsedData.map(item => {
          const result = fuse.search(item.rawName);
          const bestMatch = result.length > 0 ? result[0] : null;
          const confidenceScore = bestMatch && bestMatch.score !== undefined 
            ? Math.max(0, Math.round((1 - bestMatch.score) * 100))
            : 0;

          return {
            rawName: item.rawName,
            qty: item.qty,
            buyPrice: item.buyPrice,
            matchedId: bestMatch ? bestMatch.item.id : null,
            matchedName: bestMatch ? bestMatch.item.nama_barang : "Tidak Ditemukan",
            confidence: confidenceScore,
            status: confidenceScore >= 80 ? 'green' : (confidenceScore >= 50 ? 'yellow' : 'red')
          };
        });

        setExtractedItems(enrichedData);
        toast.success('Nota berhasil dianalisis!', { id: 'ocr-toast' });
      } else {
        throw new Error('Format response AI tidak sesuai (bukan array).');
      }
    } catch (error: any) {
      console.error('AI Error:', error);
      toast.error('Gagal menganalisis nota: ' + (error.message || 'Unknown error'), { id: 'ocr-toast' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualMatch = (index: number, selectedValue: string) => {
    if (selectedValue === "new_item") {
      const newItems = [...extractedItems];
      newItems[index] = {
        ...newItems[index],
        isNewItem: true,
        newProductName: newItems[index].rawName || "",
        newSellPrice: 0,
        status: 'blue',
      };
      setExtractedItems(newItems);
      return;
    }

    if (!selectedValue) return;

    const matchedProduct = inventory.find(b => b.id === selectedValue);
    if (matchedProduct) {
      const newItems = [...extractedItems];
      newItems[index] = {
        ...newItems[index],
        isNewItem: false,
        matchedId: matchedProduct.id,
        matchedName: matchedProduct.nama_barang,
        confidence: 100,
        status: 'blue' // Manual Override
      };
      setExtractedItems(newItems);
      toast.success("Barang disesuaikan secara manual", { id: 'manual-match' });
    }
  };

  const handleCancelNewItem = (index: number) => {
    const newItems = [...extractedItems];
    newItems[index] = {
      ...newItems[index],
      isNewItem: false,
      newProductName: undefined,
      newSellPrice: undefined,
      status: 'red',
      matchedId: null,
      matchedName: "",
    };
    setExtractedItems(newItems);
  };

  const handleRemoveRow = (indexToRemove: number) => {
    setExtractedItems(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAddManualRow = () => {
    setExtractedItems(prev => [...prev, {
      rawName: "",
      qty: 1,
      buyPrice: 0,
      matchedId: null,
      matchedName: "",
      confidence: 0,
      status: 'red' // Forces them to use the dropdown to select the item
    }]);
  };

  const handleInputChange = (index: number, field: string, value: string | number) => {
    const newItems = [...extractedItems];
    newItems[index] = {
      ...newItems[index],
      [field]: value
    };
    setExtractedItems(newItems);
  };

  const handleSaveAll = async () => {
    const hasIncompleteNewItem = extractedItems.some(item => 
      item.isNewItem && (!item.newProductName || item.newProductName.trim() === "" || item.newSellPrice === undefined || item.newSellPrice <= 0)
    );

    if (hasIncompleteNewItem) {
      toast.error("Ada barang baru yang nama atau harga jualnya belum diisi dengan benar!", { id: 'save-toast' });
      return;
    }

    // Only process items that have been verified (green/blue status or manually added new items)
    const validItems = extractedItems.filter(item => 
      (item.matchedId && item.status !== 'red' && !item.isNewItem) || 
      (item.isNewItem && item.newProductName && item.newSellPrice > 0)
    );

    if (validItems.length === 0) {
      toast.error("Tidak ada item valid untuk disimpan!", { id: 'save-toast' });
      return;
    }

    const sanitizedItems = validItems.map(item => ({
      ...item,
      qty: Number(item.qty) || 0,
      buyPrice: Number(item.buyPrice) || 0,
      newSellPrice: Number(item.newSellPrice) || 0
    }));

    setIsSaving(true);
    toast.loading("Menyimpan stok dan mempelajari alias...", { id: 'save-toast' });

    console.log("Payload to save:", sanitizedItems);

    try {
      await posService.processSmartStockIn(sanitizedItems);
      toast.success("Stok & Alias berhasil disimpan!", { id: 'save-toast' });
      onClose(); // Will close modal and trigger App.tsx to reload data
    } catch (error: any) {
      console.error("Save Error:", error);
      toast.error("Gagal menyimpan data: " + (error.message || 'Unknown error'), { id: 'save-toast' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
      />

      {/* Main Modal container */}
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.95 }}
        className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-7xl h-[95vh] md:h-[85vh] overflow-hidden flex flex-col border border-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-100 bg-white shrink-0 z-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-orange-500 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30 text-white">
              <Camera className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-widest">Smart Stock-In</h2>
              <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">AI Receipt Scanner (Phase 1)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors active:scale-95"
          >
            <X className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>

        {/* Split Screen Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50/50">

          {/* LEFT PANEL: Image Area */}
          <div className="w-full md:w-1/2 h-[40vh] md:h-full border-b md:border-b-0 md:border-r border-slate-200 bg-slate-100 flex flex-col p-4 md:p-6 relative">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.15em] mb-3 md:mb-4 shrink-0 flex items-center gap-2">
              <UploadCloud className="w-4 h-4" /> Foto Nota Pembelian
            </h3>

            <div className="flex-1 w-full bg-slate-200/50 border-2 border-dashed border-slate-300 rounded-[1.5rem] md:rounded-[2rem] overflow-hidden relative flex flex-col items-center justify-center group transition-colors hover:border-orange-400 hover:bg-orange-50/50">
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="Receipt Preview" className="w-full h-full object-contain p-2" />
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-slate-900/80 to-transparent flex justify-center gap-2">
                    <button
                      onClick={handleClearImage}
                      disabled={isProcessing}
                      className="px-4 py-2.5 bg-white/20 hover:bg-rose-500 disabled:opacity-50 text-white backdrop-blur-md rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Batal
                    </button>
                    <button
                      onClick={processReceiptWithAI}
                      disabled={isProcessing}
                      className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-orange-500/30 disabled:shadow-none flex items-center gap-2"
                    >
                      Proses dengan AI
                    </button>
                  </div>
                </>
              ) : (
                <label htmlFor="camera-input" className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer p-6 text-center">
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-full flex items-center justify-center shadow-md text-orange-500 mb-4 group-hover:scale-110 transition-transform">
                    <Camera className="w-8 h-8 md:w-10 md:h-10" />
                  </div>
                  <p className="font-black text-slate-700 text-base md:text-lg mb-1">Ambil Foto Nota atau Upload</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest max-w-[200px]">
                    Pastikan pencahayaan cukup dan teks terbaca jelas
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    id="camera-input"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: Data/Audit Area */}
          <div className="w-full md:w-1/2 h-[60vh] md:h-full bg-white flex flex-col">
            <div className="p-4 md:p-6 pb-0 shrink-0">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Tinjau Hasil Scan Nota (Audit)
              </h3>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto px-4 md:px-6 pb-4">
              <table className="hidden md:table w-full min-w-[600px] text-left">
                <thead className="bg-slate-50 border-y border-slate-100 text-[10px] uppercase font-black text-slate-400 tracking-widest sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-center">No</th>
                    <th className="px-4 py-3">Nama di Nota</th>
                    <th className="px-4 py-3">Cari di DB</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-center">Harga Beli</th>
                    <th className="px-4 py-3 text-center hidden md:table-cell">Confidence</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Tindakan</th>
                    <th className="px-4 py-3 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isProcessing ? (
                    <tr>
                      <td colSpan={9} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
                          <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Memproses dengan AI...</p>
                        </div>
                      </td>
                    </tr>
                  ) : extractedItems.length > 0 ? (
                    extractedItems.map((item, idx) => (
                      <tr key={idx} className="text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-center">{idx + 1}</td>
                        <td className="px-4 py-3">{item.rawName}</td>
                        <td className="px-4 py-3 text-slate-900">
                          {item.isNewItem ? (
                            <input
                              type="text"
                              className="w-full min-w-[150px] text-xs bg-blue-50 border border-blue-200 rounded-lg py-1.5 px-2 text-slate-800 focus:ring-2 focus:ring-blue-500 font-bold placeholder:font-normal placeholder:text-slate-400"
                              placeholder="Ketik Nama Barang Benar"
                              value={item.newProductName || ""}
                              onChange={(e) => handleInputChange(idx, 'newProductName', e.target.value)}
                            />
                          ) : (
                            item.matchedName
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="w-16 h-11 text-center text-base bg-slate-50 border border-slate-200 rounded-lg px-2 text-slate-700 focus:ring-2 focus:ring-blue-500 font-semibold"
                            value={focusedInput?.index === idx && focusedInput?.field === 'qty' ? item.qty : formatNumber(item.qty)}
                            onFocus={() => setFocusedInput({ index: idx, field: 'qty' })}
                            onBlur={() => setFocusedInput(null)}
                            onChange={(e) => handleInputChange(idx, 'qty', parseNumber(e.target.value))}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="w-24 h-11 text-right text-base bg-slate-50 border border-slate-200 rounded-lg px-2 text-slate-700 focus:ring-2 focus:ring-blue-500 font-semibold"
                            value={focusedInput?.index === idx && focusedInput?.field === 'buyPrice' ? item.buyPrice : formatNumber(item.buyPrice)}
                            onFocus={() => setFocusedInput({ index: idx, field: 'buyPrice' })}
                            onBlur={() => setFocusedInput(null)}
                            onChange={(e) => handleInputChange(idx, 'buyPrice', parseNumber(e.target.value))}
                          />
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600 hidden md:table-cell">{item.confidence}%</td>
                        <td className="px-4 py-3">
                          {item.status === 'green' && <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-md text-xs font-bold uppercase">Auto Match</span>}
                          {item.status === 'blue' && <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-bold uppercase">Manual</span>}
                          {item.status === 'yellow' && <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-md text-xs font-bold uppercase">Cek Manual</span>}
                          {item.status === 'red' && <span className="px-2 py-1 bg-rose-100 text-rose-800 rounded-md text-xs font-bold uppercase">Tidak Ketemu</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.isNewItem ? (
                            <div className="flex items-center justify-center gap-2">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="Harga Jual"
                                  className="w-24 h-11 text-base bg-blue-50 border border-blue-200 rounded-lg px-2 text-slate-800 focus:ring-2 focus:ring-blue-500 font-bold placeholder:font-normal"
                                  value={focusedInput?.index === idx && focusedInput?.field === 'newSellPrice' ? (item.newSellPrice || "") : formatNumber(item.newSellPrice)}
                                  onFocus={() => setFocusedInput({ index: idx, field: 'newSellPrice' })}
                                  onBlur={() => setFocusedInput(null)}
                                  onChange={(e) => handleInputChange(idx, 'newSellPrice', parseNumber(e.target.value))}
                                />
                              <button onClick={() => handleCancelNewItem(idx)} className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors" title="Batal Tambah Baru">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : item.status === 'green' || item.status === 'blue' ? (
                            <span className="flex items-center justify-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Terverifikasi
                            </span>
                          ) : (
                            <button
                               onClick={() => setPickerTarget(idx)}
                               className="w-full max-w-[160px] h-11 flex items-center justify-center text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 text-slate-700 focus:ring-2 focus:ring-blue-500 font-bold shadow-sm transition-all active:scale-95 whitespace-nowrap"
                             >
                               -- Pilih Barang --
                             </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button 
                            onClick={() => handleRemoveRow(idx)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors mx-auto"
                            title="Hapus Baris"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-300">
                          <AlertCircle className="w-10 h-10 opacity-20" />
                          <p className="text-xs font-bold uppercase tracking-widest opacity-60">
                            {imagePreview ? 'Klik "Proses dengan AI" untuk mulai' : 'Menunggu foto nota di-upload...'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* MOBILE CARDS (Hidden on Desktop) */}
              <div className="md:hidden space-y-4 pt-2">
                {isProcessing ? (
                  <div className="py-20 text-center flex flex-col items-center gap-3 text-slate-400">
                    <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
                    <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Memproses dengan AI...</p>
                  </div>
                ) : extractedItems.length > 0 ? (
                  extractedItems.map((item, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      {/* Top: Name, OCR, Delete */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm leading-tight mb-1">{item.rawName}</h4>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            item.status === 'green' ? 'bg-emerald-100 text-emerald-800' :
                            item.status === 'blue' ? 'bg-blue-100 text-blue-800' :
                            item.status === 'yellow' ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {item.status === 'green' ? 'Auto Match' : item.status === 'blue' ? 'Manual' : item.status === 'yellow' ? 'Cek Manual' : 'Tidak Ketemu'}
                          </span>
                        </div>
                        <button 
                          onClick={() => handleRemoveRow(idx)}
                          className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors bg-slate-50 border border-slate-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Middle: Picker / New Item */}
                      <div>
                        {item.isNewItem ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              className="w-full text-sm bg-blue-50 border border-blue-200 rounded-lg py-2.5 px-3 text-slate-800 focus:ring-2 focus:ring-blue-500 font-bold placeholder:font-normal placeholder:text-slate-400"
                              placeholder="Ketik Nama Barang Benar"
                              value={item.newProductName || ""}
                              onChange={(e) => handleInputChange(idx, 'newProductName', e.target.value)}
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Harga Jual"
                                className="flex-1 h-11 text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 text-slate-800 focus:ring-2 focus:ring-blue-500 font-bold placeholder:font-normal"
                                value={focusedInput?.index === idx && focusedInput?.field === 'newSellPrice' ? (item.newSellPrice || "") : formatNumber(item.newSellPrice)}
                                onFocus={() => setFocusedInput({ index: idx, field: 'newSellPrice' })}
                                onBlur={() => setFocusedInput(null)}
                                onChange={(e) => handleInputChange(idx, 'newSellPrice', parseNumber(e.target.value))}
                              />
                              <button onClick={() => handleCancelNewItem(idx)} className="w-11 h-11 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ) : item.status === 'green' || item.status === 'blue' ? (
                          <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                            <p className="text-sm font-bold text-emerald-800 truncate pr-2">{item.matchedName}</p>
                            <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest shrink-0">
                              <CheckCircle2 className="w-4 h-4" /> Valid
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPickerTarget(idx)}
                            className="w-full h-11 flex items-center justify-between text-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-4 text-slate-600 focus:ring-2 focus:ring-blue-500 font-bold shadow-sm transition-all active:scale-95"
                          >
                            <span>-- Pilih Barang --</span>
                            <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                          </button>
                        )}
                      </div>

                      {/* Bottom: Qty and Harga Beli */}
                      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Qty</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="w-full h-11 text-center text-base bg-slate-50 border border-slate-200 rounded-lg px-2 text-slate-700 focus:ring-2 focus:ring-blue-500 font-semibold"
                            value={focusedInput?.index === idx && focusedInput?.field === 'qty' ? item.qty : formatNumber(item.qty)}
                            onFocus={() => setFocusedInput({ index: idx, field: 'qty' })}
                            onBlur={() => setFocusedInput(null)}
                            onChange={(e) => handleInputChange(idx, 'qty', parseNumber(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Harga Beli</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="w-full h-11 text-right text-base bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-700 focus:ring-2 focus:ring-blue-500 font-semibold"
                            value={focusedInput?.index === idx && focusedInput?.field === 'buyPrice' ? item.buyPrice : formatNumber(item.buyPrice)}
                            onFocus={() => setFocusedInput({ index: idx, field: 'buyPrice' })}
                            onBlur={() => setFocusedInput(null)}
                            onChange={(e) => handleInputChange(idx, 'buyPrice', parseNumber(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 flex flex-col items-center justify-center text-center gap-3 text-slate-300">
                    <AlertCircle className="w-10 h-10 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest opacity-60">
                      {imagePreview ? 'Klik "Proses dengan AI" untuk mulai' : 'Menunggu foto nota...'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 md:p-6 border-t border-slate-200 bg-white md:bg-slate-50 shrink-0 flex flex-col md:flex-row gap-3 md:items-center sticky bottom-0 z-20 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] md:shadow-none">
              <button
                onClick={handleAddManualRow}
                className="w-full md:w-auto px-6 h-12 md:h-10 border-2 border-dashed border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400 hover:bg-slate-100 rounded-xl font-bold text-sm md:text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shrink-0"
              >
                <Plus className="w-4 h-4" /> Tambah Baris
              </button>
              <button
                disabled={extractedItems.length === 0 || isSaving}
                onClick={handleSaveAll}
                className="w-full md:flex-1 h-14 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-xl font-black text-sm uppercase tracking-[0.1em] transition-all shadow-lg shadow-slate-900/20 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
                    Menyimpan stok...
                  </>
                ) : (
                  "Simpan Semua Stok"
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Product Picker Modal */}
      <AnimatePresence>
        {pickerTarget !== null && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPickerTarget(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 bg-white z-10 shrink-0 flex items-center gap-3 relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-7" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Cari nama barang..."
                  className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 text-base font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button
                  onClick={() => setPickerTarget(null)}
                  className="w-12 h-12 shrink-0 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <button
                  onClick={() => {
                    handleManualMatch(pickerTarget, "new_item");
                    setPickerTarget(null);
                    setSearchQuery('');
                  }}
                  className="w-full p-4 border-2 border-dashed border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-xs transition-all active:scale-95 mb-4"
                >
                  <Plus className="w-4 h-4" /> Tambah Barang Baru
                </button>

                {filteredPickerItems.length === 0 ? (
                  <div className="py-10 text-center text-slate-400">
                    <p className="font-bold text-sm">Tidak ada barang ditemukan</p>
                  </div>
                ) : (
                  filteredPickerItems.map(inv => (
                    <button
                      key={inv.id}
                      onClick={() => {
                        handleManualMatch(pickerTarget, inv.id!);
                        setPickerTarget(null);
                        setSearchQuery('');
                      }}
                      className="w-full text-left p-4 bg-white border border-slate-100 rounded-xl hover:border-blue-300 hover:shadow-md transition-all active:scale-95 flex justify-between items-center group"
                    >
                      <div>
                        <h4 className="font-black text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{inv.nama_barang}</h4>
                        {inv.aliases && inv.aliases.length > 0 && (
                          <p className="text-[10px] font-semibold text-slate-400 mt-1 uppercase tracking-widest truncate max-w-[200px]">
                            Alias: {inv.aliases.join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                          Stok: {inv.stok}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
