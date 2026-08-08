import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FlaskConical,
  Search,
  Plus,
  Minus,
  Trash2,
  Package,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { posService } from '../services/posService';
import { customConfirm } from '../utils/confirmDialog';
import { Barang, SandboxItem, SandboxLog } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface SandboxModalProps {
  inventory: Barang[];
  onClose: () => void;
  onStockUpdate: (updates: { barang_id: string; delta: number }[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getMonthKey(date: Date) {
  return format(date, 'yyyy-MM');
}

function toDate(val: any): Date {
  if (!val) return new Date();
  if (val?.toDate) return val.toDate();
  return new Date(val);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SandboxModal({ inventory, onClose, onStockUpdate }: SandboxModalProps) {
  const [activeTab, setActiveTab] = useState<'take' | 'recap'>('take');

  // --- Take tab state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [sandboxCart, setSandboxCart] = useState<SandboxItem[]>([]);
  const [catatan, setCatatan] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Recap tab state ---
  const [logs, setLogs] = useState<SandboxLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(new Date()));
  const logsLoaded = useRef(false);

  // Local stok copy so optimistic UI is accurate within this modal
  const [localInventory, setLocalInventory] = useState<Barang[]>(inventory);

  useEffect(() => {
    setLocalInventory(inventory);
  }, [inventory]);

  // ---------------------------------------------------------------------------
  // Load logs on recap tab open
  // ---------------------------------------------------------------------------
  const loadLogs = useCallback(async () => {
    if (logsLoaded.current) return;
    setIsLoadingLogs(true);
    try {
      const data = await posService.getSandboxLogs();
      setLogs(data);
      logsLoaded.current = true;
    } catch {
      toast.error('Gagal memuat rekap sandbox.', { id: 'sandbox-toast' });
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  const handleTabChange = (tab: 'take' | 'recap') => {
    setActiveTab(tab);
    if (tab === 'recap') loadLogs();
  };

  // ---------------------------------------------------------------------------
  // Search & cart actions
  // ---------------------------------------------------------------------------
  const filteredInventory = localInventory.filter(b =>
    b.nama_barang.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const addToCart = (item: Barang) => {
    setSandboxCart(prev => {
      const existing = prev.find(c => c.barang_id === item.id);
      if (existing) {
        const maxAvailable = localInventory.find(b => b.id === item.id)?.stok ?? 0;
        if (existing.jumlah >= maxAvailable) {
          toast.error('Batas stok maksimal!', { id: 'sandbox-toast' });
          return prev;
        }
        return prev.map(c =>
          c.barang_id === item.id ? { ...c, jumlah: c.jumlah + 1 } : c,
        );
      }
      if (item.stok <= 0) {
        toast.error('Stok habis!', { id: 'sandbox-toast' });
        return prev;
      }
      return [...prev, { barang_id: item.id, nama_barang: item.nama_barang, jumlah: 1, harga_jual: item.harga_jual }];
    });
    setSearchQuery('');
  };

  const updateQty = (barang_id: string, delta: number) => {
    setSandboxCart(prev =>
      prev
        .map(c => {
          if (c.barang_id !== barang_id) return c;
          const maxStok = localInventory.find(b => b.id === barang_id)?.stok ?? 0;
          const newQty = Math.min(Math.max(1, c.jumlah + delta), maxStok);
          return { ...c, jumlah: newQty };
        })
        .filter(c => c.jumlah > 0),
    );
  };

  const removeFromCart = (barang_id: string) => {
    setSandboxCart(prev => prev.filter(c => c.barang_id !== barang_id));
  };

  // ---------------------------------------------------------------------------
  // Submit — Ambil barang
  // ---------------------------------------------------------------------------
  const handleSubmit = async () => {
    if (sandboxCart.length === 0) {
      toast.error('Belum ada barang dipilih.', { id: 'sandbox-toast' });
      return;
    }

    setIsSubmitting(true);
    toast.remove();

    const cartSnapshot = [...sandboxCart];
    const catatanSnapshot = catatan;

    // Optimistic: potong stok lokal & parent
    const updates = cartSnapshot.map(c => ({ barang_id: c.barang_id, delta: -c.jumlah }));
    setLocalInventory(prev =>
      prev.map(b => {
        const u = updates.find(x => x.barang_id === b.id);
        return u ? { ...b, stok: Math.max(0, b.stok + u.delta) } : b;
      }),
    );
    onStockUpdate(updates);

    // Clear form immediately
    setSandboxCart([]);
    setCatatan('');

    try {
      const result = await posService.processSandboxTakeout(cartSnapshot, catatanSnapshot);

      // Prepend to logs if recap already loaded
      if (logsLoaded.current) {
        const newLog: SandboxLog = {
          id: result.id,
          tanggal: result.tanggal,
          catatan: catatanSnapshot.trim() || '',
          total_item: cartSnapshot.reduce((s, c) => s + c.jumlah, 0),
          items: cartSnapshot,
        };
        setLogs(prev => [newLog, ...prev]);
      }

      toast.success('Barang berhasil diambil!', { id: 'sandbox-toast', duration: 2000 });
    } catch (e: any) {
      // Rollback
      const rollback = cartSnapshot.map(c => ({ barang_id: c.barang_id, delta: c.jumlah }));
      setLocalInventory(prev =>
        prev.map(b => {
          const u = rollback.find(x => x.barang_id === b.id);
          return u ? { ...b, stok: b.stok + u.delta } : b;
        }),
      );
      onStockUpdate(rollback);
      setSandboxCart(cartSnapshot);
      setCatatan(catatanSnapshot);
      toast.error(e?.message || 'Gagal mengambil barang. Coba lagi.', { id: 'sandbox-toast', duration: 4000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete log
  // ---------------------------------------------------------------------------
  const handleDeleteLog = async (log: SandboxLog) => {
    const confirmed = await customConfirm('Hapus log ini? Stok barang akan dikembalikan.');
    if (!confirmed) return;

    toast.remove();

    // Optimistic remove
    setLogs(prev => prev.filter(l => l.id !== log.id));
    setExpandedLog(null);

    const restorations = log.items.map(i => ({ barang_id: i.barang_id, delta: i.jumlah }));
    setLocalInventory(prev =>
      prev.map(b => {
        const u = restorations.find(x => x.barang_id === b.id);
        return u ? { ...b, stok: b.stok + u.delta } : b;
      }),
    );
    onStockUpdate(restorations);

    try {
      await posService.deleteSandboxLog(log);
      toast.success('Log dihapus, stok dikembalikan.', { id: 'sandbox-toast', duration: 2000 });
    } catch (e: any) {
      // Rollback
      setLogs(prev => [log, ...prev]);
      const undo = log.items.map(i => ({ barang_id: i.barang_id, delta: -i.jumlah }));
      setLocalInventory(prev =>
        prev.map(b => {
          const u = undo.find(x => x.barang_id === b.id);
          return u ? { ...b, stok: Math.max(0, b.stok + u.delta) } : b;
        }),
      );
      onStockUpdate(undo);
      toast.error(e?.message || 'Gagal menghapus log.', { id: 'sandbox-toast', duration: 4000 });
    }
  };

  // ---------------------------------------------------------------------------
  // Recap — filter & summary
  // ---------------------------------------------------------------------------
  const monthOptions = Array.from(
    new Set(logs.map(l => getMonthKey(toDate(l.tanggal)))),
  ).sort((a, b) => b.localeCompare(a));

  // Ensure current month always appears in dropdown even if no logs yet
  if (!monthOptions.includes(selectedMonth)) {
    monthOptions.unshift(selectedMonth);
  }

  const filteredLogs = logs.filter(
    l => getMonthKey(toDate(l.tanggal)) === selectedMonth,
  );

  const monthTotalItem = filteredLogs.reduce((s, l) => s + l.total_item, 0);
  const monthEstValue = filteredLogs.reduce(
    (s, l) => s + l.items.reduce((si, i) => si + i.jumlah * i.harga_jual, 0),
    0,
  );

  const totalCartQty = sandboxCart.reduce((s, c) => s + c.jumlah, 0);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 60, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="relative w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                <FlaskConical className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight">Sandbox</h2>
                <p className="text-[10px] text-violet-200 uppercase tracking-widest font-bold">
                  Pengambilan Barang Pribadi
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all active:scale-90"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white/10 rounded-2xl p-1">
            <button
              onClick={() => handleTabChange('take')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'take'
                  ? 'bg-white text-violet-700 shadow-md'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              Ambil Barang
            </button>
            <button
              onClick={() => handleTabChange('recap')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'recap'
                  ? 'bg-white text-violet-700 shadow-md'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Rekap
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <AnimatePresence mode="wait">
            {/* ============================================================ */}
            {/* TAB: AMBIL BARANG                                             */}
            {/* ============================================================ */}
            {activeTab === 'take' && (
              <motion.div
                key="take"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                className="p-5 space-y-4"
              >
                {/* Notice */}
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 font-medium leading-relaxed">
                    Barang yang diambil <strong>tidak akan tercatat</strong> sebagai transaksi kasir.
                    Stok akan berkurang, tapi tidak masuk ke history harian maupun rekap bulanan pendapatan.
                  </p>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari barang..."
                    className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  )}
                </div>

                {/* Dropdown list */}
                <AnimatePresence>
                  {searchQuery.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="bg-white border border-slate-200 rounded-2xl shadow-xl max-h-52 overflow-y-auto"
                    >
                      {filteredInventory.length > 0 ? (
                        filteredInventory.map(item => (
                          <button
                            key={item.id}
                            disabled={item.stok <= 0}
                            onClick={() => addToCart(item)}
                            className="w-full p-3.5 flex items-center justify-between hover:bg-violet-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-b border-slate-50 last:border-0"
                          >
                            <div className="text-left">
                              <p className="text-sm font-bold text-slate-800">{item.nama_barang}</p>
                              <p className="text-[10px] text-violet-500 font-black uppercase tracking-wider">
                                Rp {item.harga_jual.toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                item.stok > 10 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                              }`}>
                                Stok: {item.stok}
                              </span>
                              <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                                <Plus className="w-3.5 h-3.5 text-violet-600" />
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-8 text-center text-slate-300">
                          <Search className="w-7 h-7 mx-auto mb-2 opacity-30" />
                          <p className="text-xs font-bold uppercase tracking-widest">Barang tidak ditemukan</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Cart */}
                {sandboxCart.length === 0 ? (
                  <div className="py-10 text-center text-slate-300">
                    <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest opacity-50">
                      Belum ada barang dipilih
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Cari dan pilih barang di atas</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {sandboxCart.length} Jenis · {totalCartQty} Item
                      </p>
                      <button
                        onClick={() => setSandboxCart([])}
                        className="text-[10px] text-rose-400 hover:text-rose-600 font-black uppercase tracking-wider"
                      >
                        Kosongkan
                      </button>
                    </div>

                    <AnimatePresence>
                      {sandboxCart.map(item => (
                        <motion.div
                          key={item.barang_id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-slate-800 truncate">{item.nama_barang}</p>
                            <p className="text-[10px] text-violet-500 font-bold">
                              Rp {(item.harga_jual * item.jumlah).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden">
                              <button
                                onClick={() => updateQty(item.barang_id, -1)}
                                className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 text-slate-500 transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-8 text-center font-black text-sm text-slate-800">
                                {item.jumlah}
                              </span>
                              <button
                                onClick={() => updateQty(item.barang_id, 1)}
                                className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 text-slate-500 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => removeFromCart(item.barang_id)}
                              className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {/* Catatan */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Catatan <span className="text-slate-300">(opsional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Untuk makan siang, pemakaian pribadi..."
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all"
                    value={catatan}
                    onChange={e => setCatatan(e.target.value)}
                    maxLength={120}
                  />
                </div>
              </motion.div>
            )}

            {/* ============================================================ */}
            {/* TAB: REKAP SANDBOX                                            */}
            {/* ============================================================ */}
            {activeTab === 'recap' && (
              <motion.div
                key="recap"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                className="p-5 space-y-4"
              >
                {/* Month filter */}
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                    Filter Bulan
                  </label>
                  <div className="relative flex-1">
                    <select
                      value={selectedMonth}
                      onChange={e => setSelectedMonth(e.target.value)}
                      className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300 pr-8 transition-all"
                    >
                      {monthOptions.map(m => (
                        <option key={m} value={m}>
                          {format(new Date(m + '-01'), 'MMMM yyyy', { locale: localeId })}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Summary card */}
                <div className="bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl p-4 text-white">
                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-200 mb-2">
                    Ringkasan Bulan Ini
                  </p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-2xl font-black tracking-tighter">{monthTotalItem} Item</p>
                      <p className="text-[10px] text-violet-200 font-bold mt-0.5">Total diambil</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black tracking-tight">
                        Rp {monthEstValue.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-violet-200 font-bold">Estimasi nilai</p>
                    </div>
                  </div>
                </div>

                {/* Logs list */}
                {isLoadingLogs ? (
                  <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin opacity-40" />
                    <p className="text-xs font-bold uppercase tracking-widest opacity-50">Memuat rekap...</p>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="py-12 text-center text-slate-300">
                    <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest opacity-50">
                      Belum ada pengambilan bulan ini
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredLogs.map(log => {
                      const logDate = toDate(log.tanggal);
                      const logEstValue = log.items.reduce((s, i) => s + i.jumlah * i.harga_jual, 0);
                      const isExpanded = expandedLog === log.id;
                      return (
                        <div key={log.id}>
                          <button
                            onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                            className={`w-full p-4 rounded-2xl transition-all border text-left ${
                              isExpanded
                                ? 'bg-white border-violet-200 shadow-md ring-1 ring-violet-50'
                                : 'bg-slate-50 border-slate-100 hover:bg-white hover:border-slate-200 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isExpanded ? 'bg-violet-500 animate-pulse' : 'bg-slate-300'}`} />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                  {format(logDate, 'dd MMM yyyy · HH:mm', { locale: localeId })}
                                </span>
                              </div>
                              {isExpanded
                                ? <ChevronUp className="w-4 h-4 text-violet-400" />
                                : <ChevronDown className="w-4 h-4 text-slate-300" />}
                            </div>
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="font-black text-base text-slate-800 tracking-tight">
                                  {log.total_item} item diambil
                                </p>
                                {log.catatan && (
                                  <p className="text-[11px] text-slate-400 font-medium mt-0.5 italic truncate max-w-[220px]">
                                    "{log.catatan}"
                                  </p>
                                )}
                              </div>
                              <p className="text-sm font-black text-violet-600 whitespace-nowrap">
                                ~Rp {logEstValue.toLocaleString()}
                              </p>
                            </div>
                          </button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden bg-white mx-1"
                              >
                                <div className="p-4 pt-3 border-t border-slate-50 space-y-3">
                                  <div className="space-y-1.5">
                                    {log.items.map((item, i) => (
                                      <div key={i} className="flex justify-between text-xs text-slate-600">
                                        <span className="flex-1 truncate pr-3 font-medium">
                                          {item.nama_barang}
                                          <span className="text-slate-400 font-bold ml-1.5">×{item.jumlah}</span>
                                        </span>
                                        <span className="font-bold font-mono text-violet-500">
                                          Rp {(item.jumlah * item.harga_jual).toLocaleString()}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="pt-3 border-t border-slate-100">
                                    <button
                                      onClick={() => handleDeleteLog(log)}
                                      className="w-full h-9 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all active:scale-95"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      Hapus &amp; Kembalikan Stok
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer action — only on take tab */}
        <AnimatePresence>
          {activeTab === 'take' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="p-5 bg-slate-900 flex items-center justify-between gap-4 flex-shrink-0"
            >
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-0.5">
                  Total Diambil
                </p>
                <p className="text-xl font-black text-white tracking-tight">
                  {totalCartQty > 0
                    ? `${totalCartQty} item`
                    : <span className="text-slate-600">—</span>}
                </p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={sandboxCart.length === 0 || isSubmitting}
                className="flex items-center gap-2 px-7 py-3.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-2xl transition-all shadow-xl shadow-violet-500/20 active:scale-95 uppercase text-xs tracking-widest"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {isSubmitting ? 'Menyimpan...' : 'Ambil Sekarang'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
