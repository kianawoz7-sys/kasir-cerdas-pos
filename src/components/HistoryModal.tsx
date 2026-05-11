import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Search,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calendar,
  BarChart3,
  List,
  Eye,
  Package,
  Clock,
  Share2,
  Download,
  Wallet,
  TrendingUp
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { posService } from '../services/posService';
import { Transaksi } from '../types';
import toast from 'react-hot-toast';
import { customConfirm } from '../utils/confirmDialog';
import { toPng } from 'html-to-image';

interface HistoryModalProps {
  history: Transaksi[];
  onClose: () => void;
  onDelete: () => void;
  onShowReceipt: (trx: Transaksi) => void; // <-- Props baru buat manggil struk
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ history, onClose, onDelete, onShowReceipt }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'rekap'>('list');
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmTrx, setDeleteConfirmTrx] = useState<Transaksi | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const filteredHistory = history.filter(trx =>
    trx.no_transaksi.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = filteredHistory.reduce((sum, trx) => sum + Number(trx.total_harga), 0);
  const totalTrx = filteredHistory.length;

  const todayHistory = history.filter(trx => {
    const trxDate = trx.tanggal?.toDate ? trx.tanggal.toDate() : new Date(trx.tanggal);
    const today = new Date();
    return trxDate.getDate() === today.getDate() &&
      trxDate.getMonth() === today.getMonth() &&
      trxDate.getFullYear() === today.getFullYear();
  });
  const todayRevenue = todayHistory.reduce((sum, trx) => sum + Number(trx.total_harga), 0);
  const todayTrxCount = todayHistory.length;

  // Rekap Data Calculation
  const monthlyRekap = useMemo(() => {
    const months: Record<string, { total: number; count: number; items: number; laba: number }> = {};

    history.forEach(trx => {
      const date = trx.tanggal.toDate ? trx.tanggal.toDate() : new Date(trx.tanggal);
      const monthKey = format(date, 'yyyy-MM');

      if (!months[monthKey]) {
        months[monthKey] = { total: 0, count: 0, items: 0, laba: 0 };
      }

      months[monthKey].total += trx.total_harga;
      months[monthKey].count += 1;
      months[monthKey].items += trx.items?.reduce((sum, item) => sum + item.jumlah, 0) || 0;

      let trxLaba = 0;
      trx.items?.forEach(item => {
        const hargaBeli = item.harga_beli || 0;
        trxLaba += (item.harga - hargaBeli) * item.jumlah;
      });
      months[monthKey].laba += trxLaba;
    });

    return Object.entries(months)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, data]) => ({ month, ...data }));
  }, [history]);

  const handleDelete = (trx: Transaksi) => {
    setDeleteConfirmTrx(trx);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmTrx) return;
    toast.remove();
    toast.loading('Menghapus transaksi...', { id: 'global-pos-toast' });
    try {
      await posService.deleteTransaksi(deleteConfirmTrx);
      toast.success('Transaksi berhasil dihapus!', { id: 'global-pos-toast', duration: 1500 });
      setDeleteConfirmTrx(null);
      onDelete();
    } catch (error) {
      toast.error('Gagal menghapus transaksi', { id: 'global-pos-toast', duration: 1500 });
    }
  };

  const downloadReport = async () => {
    if (!reportRef.current) return;

    toast.remove();
    toast.loading('Memproses gambar...', { id: 'global-pos-toast' });
    try {
      const dataUrl = await toPng(reportRef.current, {
        quality: 1.0,
        backgroundColor: '#ffffff',
        pixelRatio: 2
      });

      const link = document.createElement('a');
      link.download = `Laporan_Bulanan_KasirCerdas.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Laporan berhasil diunduh!', { id: 'global-pos-toast', duration: 1500 });
    } catch (err) {
      console.error('Gagal mengunduh gambar:', err);
      toast.error('Gagal menyimpan gambar', { id: 'global-pos-toast', duration: 1500 });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="bg-white rounded-[2rem] shadow-2xl max-w-5xl w-full h-[90vh] overflow-hidden flex flex-col border border-slate-200"
      >
        {/* Header */}
        <div className="p-4 md:p-8 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white relative">
          <div className="flex items-center gap-4 pr-10">
            <div className="bg-blue-600 p-2 md:p-3 rounded-2xl shadow-lg shadow-blue-200 shrink-0">
              <Calendar className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-widest">Arsip Penjualan</h2>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Database Riwayat Transaksi</p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 w-full md:w-auto">
            <button
              onClick={() => setActiveTab('list')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
            >
              <div className="flex items-center justify-center gap-2">
                <List className="w-3.5 h-3.5" /> Semua
              </div>
            </button>
            <button
              onClick={() => setActiveTab('rekap')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'rekap' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
            >
              <div className="flex items-center justify-center gap-2">
                <BarChart3 className="w-3.5 h-3.5" /> Rekap Bulanan
              </div>
            </button>
          </div>

          <button onClick={onClose} className="absolute right-4 top-4 md:relative md:right-auto md:top-auto p-2 hover:bg-slate-100 rounded-full transition-all active:scale-90 md:ml-4">
            <X className="w-5 h-5 md:w-6 md:h-6 text-slate-400" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/30">
          {activeTab === 'list' ? (
            <>
              {/* Filter Bar */}
              <div className="px-4 md:px-8 py-4 border-b border-slate-100 flex flex-col md:flex-row items-center gap-4 md:gap-6 bg-white/50 backdrop-blur-md">
                <div className="relative w-full md:flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari nomor transaksi (ID)..."
                    className="w-full h-11 bg-white border border-slate-200 rounded-xl pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium shadow-sm"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap self-end md:self-auto">
                  {filteredHistory.length} Record Ditemukan
                </div>
              </div>

              {/* Dynamic Revenue Summary Widget */}
              <div className="px-4 md:px-8 pt-4 md:pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Column 1: Hari Ini */}
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6 shadow-xl shadow-emerald-500/20 flex items-center justify-between text-white border border-emerald-400/30">
                    <div className="flex items-center gap-4 md:gap-5">
                      <div className="w-12 h-12 md:w-14 md:h-14 bg-white/20 border border-white/30 rounded-2xl flex items-center justify-center backdrop-blur-md shrink-0 shadow-inner">
                        <Wallet className="w-6 h-6 md:w-7 md:h-7 text-white" />
                      </div>
                      <div>
                        <h3 className="text-[10px] md:text-xs font-black text-emerald-100 uppercase tracking-widest mb-0.5 md:mb-1">Omset Hari Ini</h3>
                        <p className="text-xl md:text-3xl font-black tracking-tighter text-white drop-shadow-sm">Rp {todayRevenue.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 px-3 md:px-4 py-1.5 md:py-2 rounded-xl backdrop-blur-md shadow-sm">
                        <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-100" />
                        <span className="text-[10px] md:text-xs font-bold text-white uppercase tracking-wider">{todayTrxCount} <span className="hidden sm:inline">Trx Hari Ini</span><span className="sm:hidden">Trx</span></span>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Total Semua */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6 shadow-xl shadow-blue-500/20 flex items-center justify-between text-white border border-blue-400/30">
                    <div className="flex items-center gap-4 md:gap-5">
                      <div className="w-12 h-12 md:w-14 md:h-14 bg-white/20 border border-white/30 rounded-2xl flex items-center justify-center backdrop-blur-md shrink-0 shadow-inner">
                        <Wallet className="w-6 h-6 md:w-7 md:h-7 text-white" />
                      </div>
                      <div>
                        <h3 className="text-[10px] md:text-xs font-black text-blue-100 uppercase tracking-widest mb-0.5 md:mb-1">Total Semua</h3>
                        <p className="text-xl md:text-3xl font-black tracking-tighter text-white drop-shadow-sm">Rp {totalRevenue.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 px-3 md:px-4 py-1.5 md:py-2 rounded-xl backdrop-blur-md shadow-sm">
                        <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-200" />
                        <span className="text-[10px] md:text-xs font-bold text-white uppercase tracking-wider">{totalTrx} <span className="hidden sm:inline">Trx Total</span><span className="sm:hidden">Trx</span></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-8 pt-4 md:pt-6">
                <div className="space-y-4">
                  {filteredHistory.map(trx => (
                    <div
                      key={trx.id}
                      className={`bg-white rounded-3xl border transition-all duration-300 ${expandedId === trx.id
                        ? 'border-blue-200 shadow-xl ring-4 ring-blue-50/50'
                        : 'border-slate-100 hover:border-slate-300 shadow-sm'
                        }`}
                    >
                      <div
                        onClick={() => setExpandedId(expandedId === trx.id ? null : trx.id)}
                        className="p-4 md:p-6 cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-4 md:gap-5 w-full md:w-auto">
                          <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center transition-colors shrink-0 ${expandedId === trx.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                            }`}>
                            <Clock className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-0.5">
                              <span className="text-xs font-black text-blue-600 uppercase tracking-widest">#{trx.no_transaksi}</span>
                              <span className="text-[9px] md:text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 uppercase tracking-tighter whitespace-nowrap">
                                {format(trx.tanggal?.toDate ? trx.tanggal.toDate() : new Date(trx.tanggal), 'dd MMM yyyy • HH:mm', { locale: id })}
                              </span>
                            </div>
                            <p className="text-lg md:text-xl font-black text-slate-800 tracking-tight">Rp {trx.total_harga.toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto border-t md:border-t-0 border-slate-50 pt-3 md:pt-0">
                          <div className="text-left md:text-right flex flex-row md:flex-col gap-2 md:gap-0 items-center md:items-end">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest md:mb-0.5">{trx.items?.length || 0} Barang</p>
                            <span className="hidden md:inline text-slate-300 mx-1">•</span>
                            <p className="text-[10px] font-bold text-emerald-500 uppercase">Paid Success</p>
                          </div>
                          <div className="p-2 rounded-full border border-slate-100 bg-slate-50 text-slate-400">
                            {expandedId === trx.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedId === trx.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-slate-100"
                          >
                            <div className="p-4 md:p-8 bg-slate-50/50">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Rincian Barang</h4>
                                  <div className="space-y-3">
                                    {trx.items?.map((item, idx) => (
                                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100">
                                        <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                            <Package className="w-4 h-4 text-blue-500" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-800 text-sm truncate uppercase tracking-tight">{item.nama_barang}</p>
                                            <p className="text-[10px] font-bold text-slate-500">{item.jumlah} x Rp {item.harga.toLocaleString()}</p>
                                          </div>
                                        </div>
                                        <p className="font-black text-slate-900 text-sm whitespace-nowrap self-end sm:self-auto mt-2 sm:mt-0">Rp {item.subtotal.toLocaleString()}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="space-y-8">
                                  <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Ringkasan Pembayaran</h4>
                                    <div className="space-y-3">
                                      <div className="flex justify-between items-center opacity-60 text-xs">
                                        <span>Subtotal</span>
                                        <span className="font-mono">Rp {trx.total_harga.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between items-center opacity-60 text-xs">
                                        <span>Pajak (0%)</span>
                                        <span className="font-mono">Rp 0</span>
                                      </div>
                                      <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                                        <span className="text-xs font-bold uppercase tracking-widest">Grand Total</span>
                                        <span className="text-2xl font-black tracking-tighter">Rp {trx.total_harga.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* DI SINI LETAK TOMBOLNYA GW UBAH */}
                                  <div className="flex justify-end pr-4 gap-3 flex-col sm:flex-row mt-4 sm:mt-0">
                                    <button
                                      onClick={() => onShowReceipt(trx)}
                                      className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-all font-black uppercase text-[10px] tracking-widest w-full sm:w-auto"
                                    >
                                      <Share2 className="w-4 h-4" /> Buka Struk
                                    </button>
                                    <button
                                      onClick={() => handleDelete(trx)}
                                      className="flex items-center justify-center gap-2 px-6 py-3 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100 transition-all font-black uppercase text-[10px] tracking-widest w-full sm:w-auto"
                                    >
                                      <Trash2 className="w-4 h-4" /> Hapus Transaksi
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                  {filteredHistory.length === 0 && (
                    <div className="py-32 text-center text-slate-300">
                      <Search className="w-20 h-20 mx-auto mb-6 opacity-10" />
                      <p className="text-sm font-black uppercase tracking-widest opacity-40">Data tidak ditemukan</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Rekap Bulanan Content */
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Statistik Penjualan</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ringkasan Omset Bulanan</p>
                </div>
                {monthlyRekap.length > 0 && (
                  <button
                    onClick={downloadReport}
                    className="flex w-full sm:w-auto justify-center items-center gap-2 px-6 py-3 sm:py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-slate-900/20"
                  >
                    <Download className="w-4 h-4" /> Download Laporan
                  </button>
                )}
              </div>

              <div ref={reportRef} className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 mx-auto max-w-3xl">
                <div className="text-center mb-8 pb-6 border-b border-dashed border-slate-200">
                  <h3 className="font-black text-lg uppercase tracking-widest text-slate-900">KASIR CERDAS POS</h3>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">Laporan Omset Bulanan</p>
                  <p className="text-slate-300 font-bold text-[9px] mt-2 italic">{format(new Date(), 'dd MMMM yyyy • HH:mm', { locale: id })}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {monthlyRekap.map(item => (
                    <motion.div
                      key={item.month}
                      whileHover={{ y: -5 }}
                      className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-6 md:mb-8">
                          <div className="p-3 md:p-4 bg-emerald-50 text-emerald-600 rounded-2xl md:rounded-3xl group-hover:bg-emerald-500 group-hover:text-white transition-all duration-500">
                            <BarChart3 className="w-5 h-5 md:w-6 md:h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {item.count} Transaksi
                          </span>
                        </div>
                        <h4 className="text-[11px] md:text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                          {format(parseISO(`${item.month}-01`), 'MMMM yyyy', { locale: id })}
                        </h4>
                        <p className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter leading-tight break-all">
                          Rp {item.total.toLocaleString()}
                        </p>
                        <p className="text-sm font-black text-emerald-500 mt-2 mb-6 md:mb-8">Laba: Rp {item.laba.toLocaleString()}</p>
                      </div>

                      <div className="space-y-4 pt-6 border-t border-slate-50 italic">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 font-bold uppercase tracking-widest">Volume Item</span>
                          <span className="font-black text-slate-800">{item.items} Pcs</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 font-bold uppercase tracking-widest">Avg / Trx</span>
                          <span className="font-black text-slate-800">Rp {Math.round(item.total / item.count).toLocaleString()}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}

                  {monthlyRekap.length === 0 && (
                    <div className="col-span-full py-40 text-center text-slate-200">
                      <BarChart3 className="w-24 h-24 mx-auto mb-6 opacity-10" />
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Belum ada statistik tersedia</p>
                    </div>
                  )}
                </div>

                {/* Insight Summary */}
                {monthlyRekap.length > 0 && (
                  <div className="mt-8 p-6 md:p-8 bg-slate-900 rounded-[2rem] text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-8 shadow-xl">
                    <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto">
                      <div className="w-12 h-12 md:w-16 md:h-16 bg-white/10 backdrop-blur-md rounded-2xl md:rounded-3xl flex items-center justify-center shrink-0">
                        <Eye className="w-6 h-6 md:w-8 md:h-8 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg md:text-xl font-black tracking-tight mb-0.5 md:mb-1 uppercase tracking-widest truncate">Insight Bisnis</h3>
                        <p className="text-[9px] md:text-xs text-slate-400 uppercase tracking-widest truncate">Total Akumulasi Pendapatan</p>
                      </div>
                    </div>
                    <div className="text-left md:text-right w-full md:w-auto flex flex-col items-start md:items-end">
                      <p className="text-3xl md:text-4xl font-black tracking-tighter text-blue-400 leading-none break-all">
                        Rp {monthlyRekap.reduce((sum, item) => sum + item.total, 0).toLocaleString()}
                      </p>
                      <p className="text-sm md:text-base font-black text-emerald-400 tracking-tighter mt-2">
                        Total Laba: Rp {monthlyRekap.reduce((sum, item) => sum + item.laba, 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Modal Konfirmasi Hapus Tengah Layar (Custom Dialog) */}
      <AnimatePresence>
        {deleteConfirmTrx && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm flex flex-col gap-6 shadow-2xl border border-slate-100"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
                  <Trash2 className="w-8 h-8 text-rose-500" />
                </div>
                <h3 className="font-black text-lg uppercase tracking-wider text-rose-500 mb-1">Hapus Transaksi?</h3>
                <p className="text-[10px] font-black text-slate-400 tracking-widest mb-3">#{deleteConfirmTrx.no_transaksi}</p>
                <p className="text-xs font-bold text-slate-500 leading-relaxed px-2">
                  Apakah Anda yakin ingin menghapus permanen? Stok barang akan otomatis dikembalikan ke gudang.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmTrx(null)}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-slate-200"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-4 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-500/30"
                >
                  Ya, Hapus
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};