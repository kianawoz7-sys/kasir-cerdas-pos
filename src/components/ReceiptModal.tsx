import React, { useRef } from 'react';
import { motion } from 'motion/react';
import {
  X,
  Share2,
  Printer,
  Copy,
  MessageCircle,
  Facebook,
  CheckCircle2,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { Transaksi } from '../types';
import { toast } from 'react-hot-toast';
import { toPng } from 'html-to-image'; // Ini import baru nya!

interface Props {
  trx: Transaksi;
  onClose: () => void;
}

export const ReceiptModal: React.FC<Props> = ({ trx, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  const getShareText = () => {
    const itemsText = trx.items?.map(item =>
      `${item.nama_barang.padEnd(15)} Rp ${item.harga.toLocaleString().padEnd(8)} x${item.jumlah}`
    ).join('\n');

    return `
===================================
      WARUNG MAKAN "XYZ"
      
  No. Transaksi: ${trx.no_transaksi}
  
  ${itemsText}
  
  TOTAL: Rp ${trx.total_harga.toLocaleString()}
  
  Waktu: ${format(trx.tanggal.toDate ? trx.tanggal.toDate() : new Date(trx.tanggal), 'HH:mm')}
  Tanggal: ${format(trx.tanggal.toDate ? trx.tanggal.toDate() : new Date(trx.tanggal), 'dd MMMM yyyy')}
  
  Terima Kasih! 🙏
===================================
    `.trim();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getShareText());
    toast.success('Disalin ke clipboard');
  };

  const shareWA = () => {
    const text = encodeURIComponent(getShareText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareFB = () => {
    // Basic FB share usually needs a link, but we can copy text first
    copyToClipboard();
    toast('Teks disalin, silakan tempel di Facebook', { icon: '📘' });
  };

  const printReceipt = async () => {
    if (!receiptRef.current) return;

    // For a real app, window.print() is better with CSS @media print
    // But here we can use html2canvas to share as image or just trigger system print
    window.print();
  };

  // FUNGSI INI YANG DIUBAH PAKE HTML-TO-IMAGE
  const downloadImage = async () => {
    if (!receiptRef.current) return;

    try {
      const dataUrl = await toPng(receiptRef.current, {
        quality: 1.0,
        backgroundColor: '#ffffff' // Biar ga ada bagian item/transparan
      });

      const link = document.createElement('a');
      link.download = `${trx.no_transaksi}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Gambar berhasil diunduh!');
    } catch (err) {
      console.error('Gagal mengunduh gambar:', err);
      toast.error('Gagal menyimpan gambar');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-white rounded-[2rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] max-w-sm w-full overflow-hidden flex flex-col border border-slate-100"
      >
        <div className="p-6 border-b flex justify-between items-center bg-emerald-50/50">
          <div className="flex items-center gap-3 text-emerald-600">
            <div className="bg-emerald-500 p-1.5 rounded-full ring-4 ring-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-black uppercase tracking-widest">Transaksi Berhasil</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white rounded-full transition-all active:scale-90">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-8 bg-slate-50">
          {/* Visual Receipt Card */}
          <div
            ref={receiptRef}
            id="receipt-print"
            className="bg-white p-8 shadow-xl border border-dashed border-slate-200 rounded-sm font-mono text-[10px] leading-relaxed text-slate-700"
          >
            <div className="text-center mb-6">
              <h3 className="font-black text-sm uppercase tracking-tighter text-slate-900 border-b-2 border-slate-900 inline-block pb-1">KASIR CERDAS POS</h3>
              <p className="text-slate-400 mt-2 font-bold uppercase tracking-widest text-[8px]">Modern Digital Receipt</p>
            </div>

            <div className="border-y border-dashed border-slate-200 py-3 mb-4 flex justify-between text-[9px] font-bold text-slate-500 italic">
              <span>{format(trx.tanggal.toDate ? trx.tanggal.toDate() : new Date(trx.tanggal), 'dd/MM/yyyy')}</span>
              <span>{format(trx.tanggal.toDate ? trx.tanggal.toDate() : new Date(trx.tanggal), 'HH:mm:ss')}</span>
            </div>

            <p className="mb-6 font-black text-slate-900">ID: {trx.no_transaksi}</p>

            <div className="space-y-3 mb-8">
              {trx.items?.map((item, i) => (
                <div key={i} className="flex justify-between border-b border-slate-50 pb-2">
                  <div className="flex-1 pr-4">
                    <p className="font-black text-slate-900 uppercase leading-none mb-1">{item.nama_barang}</p>
                    <p className="text-slate-400 font-bold">{item.jumlah} x {item.harga.toLocaleString()}</p>
                  </div>
                  <span className="font-black self-end text-slate-900">{(item.jumlah * item.harga).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 mb-10">
              <div className="flex justify-between font-black text-lg text-slate-900 tracking-tighter">
                <span>TOTAL</span>
                <span>Rp {trx.total_harga.toLocaleString()}</span>
              </div>
            </div>

            <div className="text-center mt-8 pt-6 border-t border-dashed border-slate-200 opacity-60">
              <p className="font-black uppercase tracking-[0.2em] mb-1">Terima Kasih</p>
              <p className="text-[8px] font-bold uppercase tracking-widest">Silakan Datang Kembali</p>
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-2 gap-4 bg-white border-t border-slate-100">
          <button
            onClick={shareWA}
            className="flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
          <button
            onClick={copyToClipboard}
            className="flex items-center justify-center gap-2 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
          >
            <Copy className="w-4 h-4" /> Copy
          </button>
          <button
            onClick={printReceipt}
            className="flex items-center justify-center gap-2 py-4 bg-slate-900 hover:bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-slate-900/20 col-span-2 active:scale-95"
          >
            <Printer className="w-4 h-4" /> Cetak Struk
          </button>
          <button
            onClick={downloadImage}
            className="flex items-center justify-center gap-2 py-3 bg-white hover:bg-slate-50 text-slate-400 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all col-span-2 border border-slate-100 active:scale-95"
          >
            <Download className="w-4 h-4" /> Simpan Gambar
          </button>
        </div>
      </motion.div>
    </div>
  );
};