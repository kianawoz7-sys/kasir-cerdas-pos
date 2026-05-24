import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Trash2,
  Edit2,
  Search,
  Package,
  AlertCircle,
  Download,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { posService } from '../services/posService';
import { Barang } from '../types';
import { toast } from 'react-hot-toast';
import { customConfirm } from '../utils/confirmDialog';

interface Props {
  onClose: () => void;
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Normalizes a product name for comparison:
 * - Lowercase
 * - Collapse & strip all whitespace
 * - Strip common punctuation that could hide duplicates
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')           // remove all whitespace
    .replace(/[-_.,'"/()]/g, ''); // strip punctuation that hides duplicates
}

/**
 * Levenshtein distance between two strings.
 * Pure JS — no external dependency needed.
 * Returns the minimum number of single-character edits (insert, delete, replace)
 * to transform `a` into `b`.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Build (m+1) × (n+1) DP matrix
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Returns true when two normalized names are "suspiciously similar":
 * - Levenshtein distance ≤ 2 (handles 1-2 char typos / transpositions), OR
 * - One normalized name fully contains the other (detects "SariwangiTeh" ⊂ "SariwangiTehCelup")
 *
 * We skip the check when both names are very short (≤ 3 chars) to avoid
 * false positives on short abbreviations.
 */
function isFuzzyMatch(normalizedA: string, normalizedB: string): boolean {
  if (normalizedA.length <= 3 || normalizedB.length <= 3) return false;
  const dist = levenshtein(normalizedA, normalizedB);
  if (dist <= 2) return true;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return true;
  return false;
}

// =============================================================================
// COMPONENT
// =============================================================================

// Discriminated union for validateNewProduct return value.
// Declared at module scope so TypeScript can properly narrow the branches.
type ValidationResult =
  | { ok: true }
  | { ok: false; reason: 'block' }
  | { ok: false; reason: 'fuzzy'; matchedItem: Barang };

export const InventoryModal: React.FC<Props> = ({ onClose }) => {
  const [items, setItems]               = useState<Barang[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nama_barang: '',
    harga_beli: 0,
    harga: 0,
    stok: 0,
  });

  // Fuzzy-match warning dialog state.
  // When a near-duplicate is found we pause submission and let the user decide.
  const [fuzzyWarning, setFuzzyWarning] = useState<{
    matchedItem: Barang;   // the existing product that triggered the warning
    pendingForm: typeof form; // the form data we'll submit if the user proceeds
  } | null>(null);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    const data = await posService.getBarang();
    setItems(data);
    setLoading(false);
  };

  // ===========================================================================
  // CORE VALIDATION — runs before every CREATE (not edit)
  // Returns:
  //   { ok: true }                       → pass, safe to save
  //   { ok: false, reason: 'block' }     → hard block, toast already shown
  //   { ok: false, reason: 'fuzzy', similarName } → near-duplicate warning
  // ===========================================================================

  const validateNewProduct = (f: typeof form): ValidationResult => {
    toast.remove();

    // 1. Name must not be empty (HTML `required` covers this, but double-check)
    if (!f.nama_barang.trim()) {
      toast.error('Nama barang tidak boleh kosong.', { id: 'global-pos-toast' });
      return { ok: false, reason: 'block' };
    }

    // 2. Harga Beli must be > 0
    if (!f.harga_beli || f.harga_beli <= 0) {
      toast.error(
        'Harga Beli tidak boleh Rp 0 agar perhitungan laba akurat!',
        { id: 'global-pos-toast', duration: 3000 },
      );
      return { ok: false, reason: 'block' };
    }

    // 3. Harga Jual must be > 0
    if (!f.harga || f.harga <= 0) {
      toast.error('Harga Jual tidak boleh Rp 0.', {
        id: 'global-pos-toast',
        duration: 3000,
      });
      return { ok: false, reason: 'block' };
    }

    // 4. Harga Jual should not be lower than Harga Beli (loss-making entry)
    if (f.harga < f.harga_beli) {
      toast.error(
        'Harga Jual lebih rendah dari Harga Beli! Periksa kembali harga Anda.',
        { id: 'global-pos-toast', duration: 3000 },
      );
      return { ok: false, reason: 'block' };
    }

    // 5. Stok tidak boleh negatif
    if (f.stok < 0) {
      toast.error('Stok tidak boleh bernilai negatif.', { id: 'global-pos-toast' });
      return { ok: false, reason: 'block' };
    }

    const normalizedInput = normalizeName(f.nama_barang);

    // 6. STRICT duplicate check (exact match after normalization)
    //    Catches: "Sari wangi Teh" === "sariwangiteh", casing, extra spaces, punctuation
    const strictDuplicate = items.find(
      (item) => normalizeName(item.nama_barang) === normalizedInput,
    );
    if (strictDuplicate) {
      toast.error(
        `Produk ini sudah ada! Silakan cari dan edit produk yang sudah terdaftar.`,
        { id: 'global-pos-toast', duration: 4000 },
      );
      // Highlight the duplicate in the list by auto-filling the search box
      setSearch(strictDuplicate.nama_barang);
      return { ok: false, reason: 'block' };
    }

    // 7. FUZZY similarity check (near-duplicates / typos)
    //    Only warn — do not hard-block. The user may have a legitimate reason
    //    (e.g., "Teh Kotak 200ml" vs "Teh Kotak 250ml" differ by only 3 chars).
    const fuzzyDuplicate = items.find(
      (item) => isFuzzyMatch(normalizedInput, normalizeName(item.nama_barang)),
    );
    if (fuzzyDuplicate) {
      return { ok: false, reason: 'fuzzy', matchedItem: fuzzyDuplicate };
    }

    return { ok: true };
  };

  // ===========================================================================
  // HANDLE SUBMIT
  // ===========================================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.remove();

    // For EDIT mode: only validate prices — no duplicate check needed
    if (editingId) {
      if (!form.harga_beli || form.harga_beli <= 0) {
        toast.error('Harga Beli tidak boleh Rp 0 agar perhitungan laba akurat!', {
          id: 'global-pos-toast',
          duration: 3000,
        });
        return;
      }
      if (!form.harga || form.harga <= 0) {
        toast.error('Harga Jual tidak boleh Rp 0.', { id: 'global-pos-toast', duration: 3000 });
        return;
      }
      if (form.harga < form.harga_beli) {
        toast.error('Harga Jual lebih rendah dari Harga Beli! Periksa kembali harga Anda.', {
          id: 'global-pos-toast',
          duration: 3000,
        });
        return;
      }
      await persistSave(form, editingId);
      return;
    }

    // CREATE mode: full validation
    const result = validateNewProduct(form);

    if (result.ok) {
      await persistSave(form, null);
    } else {
      const failed = result as { ok: false; reason: 'block' } | { ok: false; reason: 'fuzzy'; matchedItem: Barang };
      if (failed.reason === 'fuzzy') {
        // Pause — show the warning modal so the user can decide.
        setFuzzyWarning({ matchedItem: failed.matchedItem, pendingForm: { ...form } });
      }
      // 'block' case: toast was already shown inside validateNewProduct
    }
  };

  // Persist to Firestore (called after all validations pass)
  const persistSave = async (f: typeof form, id: string | null) => {
    toast.loading('Menyimpan...', { id: 'global-pos-toast' });
    try {
      if (id) {
        await posService.updateBarang(id, f);
        toast.success('Barang diperbarui', { id: 'global-pos-toast', duration: 1500 });
      } else {
        await posService.addBarang(f);
        toast.success('Barang ditambahkan', { id: 'global-pos-toast', duration: 1500 });
      }
      setForm({ nama_barang: '', harga_beli: 0, harga: 0, stok: 0 });
      setEditingId(null);
      setFuzzyWarning(null);
      setTimeout(() => loadItems(), 100);
    } catch {
      toast.error('Gagal menyimpan', { id: 'global-pos-toast', duration: 1500 });
    }
  };

  // ===========================================================================
  // FUZZY WARNING ACTIONS
  // ===========================================================================
  const handleFuzzyProceed = async () => {
    if (!fuzzyWarning) return;
    await persistSave(fuzzyWarning.pendingForm, null);
  };

  const handleEditExisting = () => {
    if (!fuzzyWarning) return;
    const itemToEdit = fuzzyWarning.matchedItem;
    setFuzzyWarning(null);
    // Show the similar product in the search box so the user can see it in the list
    setSearch(itemToEdit.nama_barang);
    // Transition the form to edit mode with the matched item
    handleEdit(itemToEdit);
  };

  // ===========================================================================
  // EDIT / DELETE
  // ===========================================================================
  const handleEdit = (item: Barang) => {
    setEditingId(item.id);
    setForm({
      nama_barang: item.nama_barang,
      harga_beli:  item.harga_beli || 0,
      harga:       item.harga,
      stok:        item.stok,
    });
    setTimeout(() => {
      document.getElementById('inventory-form-top')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 100);
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await customConfirm('Hapus barang ini dari database?');
    if (!isConfirmed) return;

    toast.remove();
    toast.loading('Menghapus...', { id: 'global-pos-toast' });
    try {
      await posService.deleteBarang(id);
      toast.success('Terhapus', { id: 'global-pos-toast', duration: 1500 });
      setTimeout(() => loadItems(), 100);
    } catch {
      toast.error('Gagal menghapus', { id: 'global-pos-toast', duration: 1500 });
    } finally {
      setTimeout(() => toast.dismiss('global-pos-toast'), 1500);
    }
  };

  // ===========================================================================
  // PDF EXPORT
  // ===========================================================================
  const exportPDF = () => {
    toast.remove();
    if (items.length === 0) {
      toast.error('Tidak ada data untuk diexport', { id: 'global-pos-toast', duration: 1500 });
      return;
    }

    const doc     = new jsPDF();
    const dateStr = format(new Date(), 'dd MMM yyyy HH:mm');

    const totalValuasi = items.reduce(
      (sum, item) => sum + (Number(item.harga_beli || 0) * Number(item.stok)),
      0,
    );
    const totalPotensiKeuntungan = items.reduce(
      (sum, item) => sum + ((Number(item.harga) - Number(item.harga_beli || 0)) * Number(item.stok)),
      0,
    );

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN STOK GUDANG - KASIR CERDAS TOKO', 14, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dicetak pada: ${dateStr}`, 14, 28);

    doc.setFont('helvetica', 'bold');
    doc.text(`Total Valuasi Gudang (Modal): Rp ${totalValuasi.toLocaleString('id-ID')}`, 14, 34);
    doc.text(`Total Potensi Keuntungan: Rp ${totalPotensiKeuntungan.toLocaleString('id-ID')}`, 14, 40);

    const sortedItems = [...items].sort((a, b) => {
      const getCat = (stok: number) => (stok === 0 ? 0 : stok <= 5 ? 1 : 2);
      const diff = getCat(a.stok) - getCat(b.stok);
      return diff !== 0 ? diff : a.nama_barang.localeCompare(b.nama_barang);
    });

    const tableData = sortedItems.map((item, index) => {
      const status = item.stok === 0 ? 'HABIS' : item.stok <= 5 ? 'MENIPIS' : 'AMAN';
      return [
        index + 1,
        item.nama_barang,
        `Rp ${(item.harga_beli || 0).toLocaleString()}`,
        `Rp ${item.harga.toLocaleString()}`,
        item.stok.toString(),
        status,
      ];
    });

    autoTable(doc, {
      startY: 48,
      head: [['No', 'Nama Barang', 'Harga Beli', 'Harga Jual', 'Stok', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const status = (data.row.raw as string[])[5];
          if (status === 'HABIS') {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [153, 27, 27];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'MENIPIS') {
            data.cell.styles.fillColor = [254, 249, 195];
            data.cell.styles.textColor = [133, 77, 14];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    doc.save(`Laporan_Stok_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    toast.success('Laporan PDF berhasil diunduh', { id: 'global-pos-toast', duration: 1500 });
  };

  // ===========================================================================
  // DERIVED STATE
  // ===========================================================================
  const filteredItems = items.filter(
    (i) =>
      i.nama_barang.toLowerCase().includes(search.toLowerCase()) &&
      (!showOnlyInStock || i.stok > 0),
  );

  // ===========================================================================
  // RENDER
  // ===========================================================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Main modal */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="relative bg-white rounded-[2rem] shadow-2xl max-w-4xl w-full h-[90vh] overflow-hidden flex flex-col border border-slate-200"
      >
        {/* Header */}
        <div className="p-4 md:p-8 border-b flex justify-between items-start md:items-center bg-white relative">
          <div className="flex items-center gap-4 pr-10">
            <div className="bg-slate-900 p-2 md:p-3 rounded-2xl shadow-lg shadow-slate-200">
              <Package className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-widest">Gudang Barang</h2>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Inventory Management System</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 md:relative md:right-auto md:top-auto p-2 hover:bg-slate-100 rounded-full transition-all active:scale-90"
          >
            <X className="w-5 h-5 md:w-6 md:h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-12 bg-slate-50/30">

          {/* ================================================================ */}
          {/* LEFT: Add / Edit Form                                              */}
          {/* ================================================================ */}
          <div id="inventory-form-top" className="md:col-span-4 p-4 md:p-8 border-b md:border-b-0 md:border-r border-slate-100 bg-white">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${editingId ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} />
              {editingId ? 'Edit Barang' : 'Barang Baru'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Nama Barang */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Nama Barang</label>
                <input
                  type="text"
                  className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-bold text-slate-700"
                  placeholder="Nama Produk..."
                  value={form.nama_barang}
                  onChange={(e) => setForm({ ...form, nama_barang: e.target.value })}
                  required
                />
              </div>

              {/* Harga Beli */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                  Harga Beli (Modal) <span className="text-rose-400 normal-case font-bold">*wajib &gt; 0</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">Rp</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`w-full h-12 bg-slate-50 border rounded-xl pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-bold text-slate-700 ${
                      form.harga_beli <= 0 && form.nama_barang
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-slate-200'
                    }`}
                    placeholder="0"
                    value={form.harga_beli === 0 ? '' : form.harga_beli.toLocaleString('id-ID')}
                    onChange={(e) => {
                      const rawVal = e.target.value.replace(/\D/g, '');
                      const val    = rawVal === '' ? 0 : parseInt(rawVal);
                      setForm({ ...form, harga_beli: isNaN(val) ? 0 : val });
                    }}
                    required
                  />
                </div>
                {form.harga_beli <= 0 && form.nama_barang && (
                  <p className="mt-1.5 text-[10px] font-black text-rose-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Harga beli wajib diisi agar laba terhitung akurat
                  </p>
                )}
              </div>

              {/* Harga Jual */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Harga Jual</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">Rp</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`w-full h-12 bg-slate-50 border rounded-xl pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-bold text-slate-700 ${
                      form.harga > 0 && form.harga < form.harga_beli
                        ? 'border-amber-400 bg-amber-50/40'
                        : 'border-slate-200'
                    }`}
                    placeholder="0"
                    value={form.harga === 0 ? '' : form.harga.toLocaleString('id-ID')}
                    onChange={(e) => {
                      const rawVal = e.target.value.replace(/\D/g, '');
                      const val    = rawVal === '' ? 0 : parseInt(rawVal);
                      setForm({ ...form, harga: isNaN(val) ? 0 : val });
                    }}
                    required
                  />
                </div>
                {form.harga > 0 && form.harga < form.harga_beli && (
                  <p className="mt-1.5 text-[10px] font-black text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Harga jual lebih rendah dari harga beli — rugi!
                  </p>
                )}
                {form.harga > 0 && form.harga_beli > 0 && form.harga >= form.harga_beli && (
                  <p className="mt-1.5 text-[10px] font-black text-emerald-600">
                    Margin: Rp {(form.harga - form.harga_beli).toLocaleString('id-ID')}
                  </p>
                )}
              </div>

              {/* Stok */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Stok Inventory</label>
                <input
                  type="number"
                  min="0"
                  className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-bold text-slate-700"
                  placeholder="0"
                  value={form.stok === 0 ? '' : form.stok}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                    setForm({ ...form, stok: isNaN(val) ? 0 : val });
                  }}
                  required
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  className={`flex-1 h-12 rounded-xl text-white font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 ${
                    editingId
                      ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                      : 'bg-slate-900 hover:bg-black shadow-slate-900/20'
                  }`}
                >
                  {editingId ? 'Perbarui' : 'Simpan'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm({ nama_barang: '', harga_beli: 0, harga: 0, stok: 0 });
                    }}
                    className="h-12 w-12 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-all active:scale-90"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                )}
              </div>
            </form>

            {/* Info box */}
            <div className="mt-8 p-5 rounded-2xl bg-slate-50 border border-slate-100 italic">
              <div className="flex gap-4">
                <AlertCircle className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  Informasi stok akan terpotong otomatis saat transaksi dilakukan. Sistem akan memblokir produk duplikat dan nama yang sangat mirip secara otomatis.
                </p>
              </div>
            </div>
          </div>

          {/* ================================================================ */}
          {/* RIGHT: Product list                                               */}
          {/* ================================================================ */}
          <div className="md:col-span-8 flex flex-col bg-slate-50/30">
            {/* Toolbar */}
            <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row items-center gap-4 bg-white/50 backdrop-blur-md">
              <div className="relative w-full md:flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari inventory..."
                  className="w-full h-11 bg-white border border-slate-200 rounded-xl pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex w-full md:w-auto items-center justify-between gap-4">
                <div className="flex gap-2 flex-1 md:flex-none">
                  <button
                    onClick={exportPDF}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 h-11 bg-slate-900 text-white hover:bg-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md shadow-slate-900/10"
                    title="Download Laporan PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Export PDF</span>
                  </button>
                  <button
                    onClick={() => setShowOnlyInStock(!showOnlyInStock)}
                    className={`flex-1 md:flex-none justify-center items-center gap-2 px-4 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      showOnlyInStock
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                        : 'bg-white text-slate-400 border border-slate-200 hover:border-blue-200 hover:text-blue-500'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5 inline-block mr-1" />
                    <span className="hidden md:inline">{showOnlyInStock ? 'Tersedia' : 'Semua'}</span>
                    <span className="md:hidden">{showOnlyInStock ? 'Stok' : 'Semua'}</span>
                  </button>
                </div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                  {filteredItems.length} Items
                </div>
              </div>
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 md:h-auto min-h-[300px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Database...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-24 text-slate-300">
                  <Package className="w-20 h-20 mx-auto mb-4 opacity-10" />
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Database Kosong</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {filteredItems.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      className="p-5 bg-white border border-slate-100 rounded-[1.5rem] shadow-sm hover:shadow-xl hover:border-blue-100 transition-all group relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-black text-slate-800 text-lg leading-tight mb-1">{item.nama_barang}</h4>
                          <p className="text-sm font-bold text-blue-600 tracking-tight">Rp {item.harga.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-1">Modal: Rp {(item.harga_beli || 0).toLocaleString()}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${item.stok > 10 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            Stok: {item.stok}
                          </div>
                          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 border border-emerald-100 rounded-full">
                            Margin: Rp {(item.harga - (item.harga_beli || 0)).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-4 md:mt-0 md:translate-y-10 md:group-hover:translate-y-0 transition-all duration-300">
                        <button
                          onClick={() => handleEdit(item)}
                          className="flex-1 h-9 flex items-center justify-center gap-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="w-9 h-9 flex items-center justify-center bg-slate-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ===================================================================== */}
      {/* FUZZY SIMILARITY WARNING MODAL                                        */}
      {/* Shown when a near-duplicate is detected. User may proceed or cancel.  */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {fuzzyWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[2rem] p-8 w-full max-w-sm flex flex-col gap-6 shadow-2xl border border-amber-100"
            >
              {/* Icon + title */}
              <div className="text-center">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-200">
                  <ShieldAlert className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="font-black text-lg uppercase tracking-wider text-amber-600 mb-1">
                  Produk Sangat Mirip!
                </h3>
                <p className="text-[10px] font-black text-slate-400 tracking-widest mb-4 uppercase">
                  Potensi duplikat terdeteksi
                </p>
                {/* Show both names side by side for clarity */}
                <div className="space-y-3 text-left">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Produk yang sudah ada</p>
                    <p className="font-black text-slate-800 text-sm">{fuzzyWarning.matchedItem.nama_barang}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Yang ingin Anda tambahkan</p>
                    <p className="font-black text-slate-800 text-sm">{fuzzyWarning.pendingForm.nama_barang}</p>
                  </div>
                </div>
                <p className="text-xs font-bold text-slate-500 leading-relaxed mt-4">
                  Apakah ini produk yang berbeda, atau sebaiknya Anda <span className="text-blue-600">edit produk yang sudah ada</span>?
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleEditExisting}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-slate-200"
                >
                  Edit yang Ada
                </button>
                <button
                  onClick={handleFuzzyProceed}
                  className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-amber-500/30"
                >
                  Tetap Tambah
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
