import React, { useState, useEffect } from 'react';
import { Toaster, toast, useToasterStore } from 'react-hot-toast';
import {
  Package,
  ShoppingCart,
  History as HistoryIcon,
  Trash2,
  Plus,
  Minus,
  Share2,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  LayoutDashboard,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { posService } from './services/posService';
import { Barang, Transaksi, CartItem, TransaksiItem } from './types';
import { ReceiptModal } from './components/ReceiptModal';
import { customConfirm } from './utils/confirmDialog';
import { InventoryModal } from './components/InventoryModal';
import { HistoryModal } from './components/HistoryModal';

export default function App() {
  const { toasts } = useToasterStore();

  useEffect(() => {
    toasts
      .filter((t) => t.visible)
      .filter((_, i) => i >= 1)
      .forEach((t) => toast.dismiss(t.id));
  }, [toasts]);

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [barang, setBarang] = useState<Barang[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [history, setHistory] = useState<Transaksi[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // UI States
  const [showReceipt, setShowReceipt] = useState<Transaksi | null>(null);
  const [showInventory, setShowInventory] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTrx, setExpandedTrx] = useState<string | null>(null);
  const [selectedBarangId, setSelectedBarangId] = useState('');

  // UBAHAN 1: Izinin state jadi string kosong sementara waktu biar bisa dihapus (backspace)
  const [qtyInput, setQtyInput] = useState<number | ''>(1);

  const filteredBarang = barang.filter(b =>
    b.nama_barang.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    let unsub: () => void;

    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        unsub = onAuthStateChanged(auth, (u) => {
          setUser(u);
          setLoading(false);
        });
      })
      .catch((error) => {
        console.error("Gagal nyimpen sesi login:", error);
        setLoading(false);
      });

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      if (unsub) unsub();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    const [b, h] = await Promise.all([
      posService.getBarang(),
      posService.getTransaksi()
    ]);
    setBarang(b);
    setHistory(h);
  };

  const login = async () => {
    toast.remove();
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('Berhasil login', { id: 'global-pos-toast' });
    } catch (e) {
      toast.error('Gagal login', { id: 'global-pos-toast' });
    }
  };

  const logout = async () => {
    await signOut(auth);
    setCart([]);
    setBarang([]);
    setHistory([]);
  };

  const addToCart = () => {
    toast.remove();
    if (!selectedBarangId) {
      toast.error('Pilih barang terlebih dahulu', { id: 'global-pos-toast' });
      return;
    }

    const item = barang.find(b => b.id === selectedBarangId);
    if (!item) return;

    // UBAHAN 2: Konversi yang bener biar aman buat dihitung
    const qty = Number(qtyInput);

    if (qty <= 0 || isNaN(qty)) {
      toast.error('Jumlah tidak valid!', { id: 'global-pos-toast' });
      return;
    }

    const existingIndex = cart.findIndex(c => c.barang_id === item.id);
    if (existingIndex > -1) {
      const newCart = [...cart];

      if (newCart[existingIndex].jumlah >= item.stok) {
        toast.error('Batas stok maksimal tercapai!', { id: 'global-pos-toast' });
      } else {
        const newQty = newCart[existingIndex].jumlah + qty;
        if (newQty > item.stok) {
          toast.error(`Sisa stok hanya ${item.stok}, disesuaikan.`, { id: 'global-pos-toast' });
          newCart[existingIndex].jumlah = item.stok;
        } else {
          newCart[existingIndex].jumlah = newQty;
        }
        newCart[existingIndex].subtotal = Number(item.harga) * newCart[existingIndex].jumlah;
        setCart(newCart);
      }
    } else {
      if (qty > item.stok) {
        toast.error('Stok tidak mencukupi', { id: 'global-pos-toast' });
        return;
      }
      setCart([...cart, {
        barang_id: item.id,
        nama_barang: item.nama_barang,
        harga_beli: Number(item.harga_beli) || 0,
        harga: Number(item.harga),
        jumlah: qty,
        subtotal: qty * Number(item.harga)
      }]);
    }

    setSelectedBarangId('');
    setQtyInput(1);
    toast.success(`${item.nama_barang} ditambahkan`, { id: 'global-pos-toast', duration: 800 });
  };

  const updateCartQty = (index: number, newQty: number) => {
    toast.remove();
    if (newQty <= 0) return;

    const itemInBarang = barang.find(b => b.id === cart[index].barang_id);
    if (itemInBarang && newQty > itemInBarang.stok) {
      toast.error('Batas stok maksimal tercapai!', { id: 'global-pos-toast' });
      return;
    }

    const newCart = [...cart];
    newCart[index].jumlah = newQty;
    newCart[index].subtotal = Number(newCart[index].harga) * newQty;
    setCart(newCart);
  };

  const removeFromCart = (index: number) => {
    const newCart = cart.filter((_, i) => i !== index);
    setCart(newCart);
  };

  const totalBelanja = cart.reduce((sum, item) => sum + (Number(item.harga) * item.jumlah), 0);
  const totalQty = cart.reduce((sum, item) => sum + item.jumlah, 0);

  const handleCheckout = async () => {
    toast.remove();
    if (cart.length === 0) {
      toast.error('Keranjang kosong', { id: 'global-pos-toast' });
      return;
    }

    const total_harga = totalBelanja;
    toast.loading('Memproses transaksi...', { id: 'global-pos-toast' });
    try {
      const result = await posService.checkout({
        total_harga: total_harga,
        total_qty: totalQty,
        status: 'completed'
      }, cart);

      toast.success('Transaksi Berhasil!', { id: 'global-pos-toast' });

      await loadData();

      const fullTrx: Transaksi = {
        id: result.id,
        no_transaksi: result.no_transaksi,
        total_harga: total_harga,
        total_qty: totalQty,
        status: 'completed',
        tanggal: result.tanggal,
        items: cart
      };

      setShowReceipt(fullTrx);
      setCart([]);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses transaksi', { id: 'global-pos-toast' });
    }
  };

  const handleDeleteTrx = async (trx: Transaksi) => {
    const isConfirmed = await customConfirm('Hapus transaksi ini? Stok akan dikembalikan.');
    if (!isConfirmed) return;

    toast.remove();
    setExpandedTrx(null);
    toast.loading('Menghapus...', { id: 'global-pos-toast' });
    try {
      await posService.deleteTransaksi(trx);
      toast.success('Transaksi dihapus', { id: 'global-pos-toast', duration: 1500 });
      // Delay to avoid UI blocking toast
      setTimeout(() => loadData(), 100);
    } catch (e) {
      toast.error('Gagal menghapus', { id: 'global-pos-toast', duration: 1500 });
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center">
        <Package className="w-12 h-12 text-blue-500 mb-4" />
        <p className="text-gray-500">Memuat sistem...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center"
      >
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <LayoutDashboard className="w-10 h-10 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Kasir Cerdas POS</h1>
        <p className="text-gray-500 mb-8">Sistem kasir modern, cepat, dan terpercaya untuk bisnis Anda.</p>
        <button
          onClick={login}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
        >
          Masuk dengan Google
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      <Toaster
        position="top-center"
        toastOptions={{ duration: 1500 }}
      />

      <header className="flex items-center justify-between px-4 md:px-8 py-2.5 md:py-4 bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-lg md:text-xl shadow-lg shadow-blue-200">K</div>
          <div>
            <h1 className="text-sm md:text-xl font-black leading-none text-slate-900 tracking-tight">KASIR CERDAS</h1>
            <span className="text-[8px] md:text-[10px] text-slate-400 uppercase tracking-widest font-bold">POS System v2.0</span>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900">{format(currentTime, 'dd MMMM yyyy')}</p>
            <p className="text-xs text-slate-500 font-mono tracking-tighter">{format(currentTime, 'HH:mm:ss')}</p>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <button
              onClick={() => setShowHistoryModal(true)}
              className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all active:scale-95 shadow-sm"
              title="Semua Transaksi & Rekap"
            >
              <FileText className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button
              onClick={() => setShowInventory(true)}
              className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all active:scale-95 shadow-sm"
              title="Inventaris"
            >
              <Package className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <div className="h-6 md:h-8 w-[1px] bg-slate-200 mx-0.5 md:mx-1"></div>
            <button
              onClick={logout}
              className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border-2 border-white shadow-md hover:border-blue-200 transition-all active:scale-95"
              title={user.displayName}
            >
              <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] mx-auto w-full px-4 md:px-8 py-4 md:py-8 grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-8 overflow-x-hidden">

        <div className="lg:col-span-8 space-y-4 md:space-y-6">
          <section className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
              <div className="md:col-span-12">
                <label className="block text-[10px] font-black text-slate-400 mb-1.5 md:mb-2 uppercase tracking-widest">Pilih Barang</label>
                <div className="relative group/search">
                  <div className="relative">
                    <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/search:text-blue-500 transition-colors" />
                    <input
                      type="text"
                      placeholder="Cari nama barang..."
                      className="w-full h-10 md:h-12 bg-slate-50 border border-slate-200 rounded-xl pl-10 md:pl-11 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium text-sm text-slate-700 shadow-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => {
                        if (searchQuery === '') setSearchQuery('');
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-12 top-11/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full transition-colors"
                      >
                        <X className="w-3 h-3 text-slate-500" />
                      </button>
                    )}
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>

                  <AnimatePresence>
                    {searchQuery.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute z-40 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-64 overflow-y-auto p-2 space-y-1"
                      >
                        {filteredBarang.length > 0 ? (
                          filteredBarang.map(item => (
                            <button
                              key={item.id}
                              disabled={item.stok <= 0}
                              onClick={() => {
                                setSelectedBarangId(item.id);
                                setSearchQuery('');
                                toast.success(`Terpilih: ${item.nama_barang}`, { duration: 1000 });
                              }}
                              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 rounded-xl transition-all group disabled:opacity-50 disabled:grayscale"
                            >
                              <div className="flex flex-col items-start">
                                <span className="font-bold text-slate-800 text-sm">{item.nama_barang}</span>
                                <span className="text-[10px] font-black uppercase text-blue-500 tracking-widest">Rp {item.harga.toLocaleString()}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${item.stok > 10 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                  STOK: {item.stok}
                                </span>
                                <Plus className="w-4 h-4 mt-1 opacity-0 group-hover:opacity-100 text-blue-600 transition-opacity" />
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="p-10 text-center text-slate-300">
                            <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Barang tidak ditemukan</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <AnimatePresence>
                {selectedBarangId && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="md:col-span-12"
                  >
                    <div className="p-3 md:p-4 bg-blue-50 border border-blue-100 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between group gap-3 md:gap-4">
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className="w-8 h-8 md:w-10 md:h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                          <Package className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-sm uppercase tracking-tight line-clamp-1">
                            {barang.find(b => b.id === selectedBarangId)?.nama_barang}
                          </p>
                          <p className="text-xs font-bold text-blue-600">Terpilih</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="flex flex-col items-start sm:items-end w-full sm:w-auto">
                          <label className="text-[9px] font-black text-slate-400 uppercase mb-1">Jumlah</label>
                          <div className="flex items-center bg-white rounded-xl p-0.5 border border-blue-200">

                            {/* UBAHAN 3: Update minus button */}
                            <button
                              onClick={() => setQtyInput(Math.max(1, Number(qtyInput) - 1))}
                              className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>

                            {/* UBAHAN 4: Input ajaib anti paten-paten club */}
                            <input
                              type="number"
                              className="w-12 text-center font-black text-sm text-slate-800 bg-transparent focus:outline-none"
                              value={qtyInput}
                              onFocus={(e) => e.target.select()} // Langsung block semua text pas diklik
                              onBlur={() => {
                                // Kalo pas ditinggalin inputnya kosong / 0, otomatis balikin ke 1
                                if (qtyInput === '' || Number(qtyInput) <= 0) setQtyInput(1);
                              }}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  setQtyInput(''); // Bolehin kosong pas lagi dihapus
                                } else {
                                  const parsed = parseInt(val);
                                  setQtyInput(isNaN(parsed) ? '' : parsed);
                                }
                              }}
                            />

                            {/* UBAHAN 5: Update plus button */}
                            <button
                              onClick={() => setQtyInput(Number(qtyInput) + 1)}
                              className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={addToCart}
                          className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                        >
                          Add to List
                        </button>
                        <button
                          onClick={() => setSelectedBarangId('')}
                          className="p-2 text-slate-300 hover:text-slate-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          <section className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Daftar Pesanan</h2>
              {cart.length > 0 && (
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{totalQty} Item Terpilih</span>
                  <button
                    onClick={() => setCart([])}
                    className="text-[10px] text-rose-500 hover:text-rose-600 font-black uppercase tracking-widest"
                  >
                    Kosongkan
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-300 py-12">
                  <ShoppingCart className="w-16 h-16 mb-4 opacity-10" />
                  <p className="font-bold uppercase tracking-widest text-xs opacity-40 text-slate-500">Keranjang masih kosong</p>
                </div>
              ) : (
                <table className="w-full text-left min-w-[500px]">
                  <thead className="bg-slate-50/50 text-[10px] uppercase text-slate-400 font-black tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4">Produk</th>
                      <th className="px-6 py-4 text-center">Harga</th>
                      <th className="px-6 py-4 text-center">Jumlah</th>
                      <th className="px-6 py-4 text-right">Subtotal</th>
                      <th className="px-6 py-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-50">
                    {cart.map((item, idx) => (
                      <motion.tr
                        key={item.barang_id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-5">
                          <p className="font-bold text-slate-800 text-base">{item.nama_barang}</p>
                        </td>
                        <td className="px-6 py-5 text-center text-slate-500 font-medium whitespace-nowrap">
                          Rp {item.harga.toLocaleString()}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center justify-center bg-slate-100/80 rounded-xl p-1 w-fit mx-auto">
                            <button
                              onClick={() => updateCartQty(idx, item.jumlah - 1)}
                              className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-lg transition-all text-slate-600 active:scale-90"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-10 text-center font-black text-sm text-slate-800">{item.jumlah}</span>
                            <button
                              onClick={() => updateCartQty(idx, item.jumlah + 1)}
                              className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-lg transition-all text-slate-600 active:scale-90"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right font-black text-slate-900 whitespace-nowrap">
                          Rp {item.subtotal.toLocaleString()}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex justify-center">
                            <button
                              onClick={() => removeFromCart(idx)}
                              className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 sm:p-6 bg-slate-900 flex flex-col sm:flex-row gap-4 sm:gap-0 justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
              <div className="text-center sm:text-left">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em] mb-1">Total Pembayaran</p>
                <p className="text-3xl font-black text-white tracking-tighter">Rp {totalBelanja.toLocaleString()}</p>
              </div>
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0}
                className="w-full sm:w-auto px-10 py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-2xl transition-all shadow-xl shadow-emerald-500/20 active:scale-95 uppercase text-sm tracking-widest"
              >
                Checkout
              </button>
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4 md:gap-6">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full">
            <div className="px-4 md:px-5 py-3 md:py-4 bg-slate-50/80 border-b border-slate-200 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Riwayat Hari Ini</span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded uppercase tracking-tighter">Live Audit</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {history.length === 0 ? (
                <div className="py-20 text-center text-slate-300">
                  <HistoryIcon className="w-12 h-12 mx-auto mb-3 opacity-10" />
                  <p className="text-xs font-bold uppercase tracking-widest opacity-40">Belum ada riwayat</p>
                </div>
              ) : (
                history.map(trx => (
                  <div key={trx.id} className="group">
                    <button
                      onClick={() => setExpandedTrx(expandedTrx === trx.id ? null : trx.id)}
                      className={`w-full p-4 rounded-2xl transition-all border ${expandedTrx === trx.id ? 'bg-white border-blue-200 shadow-md ring-1 ring-blue-50' : 'bg-slate-50/50 border-slate-100 hover:bg-white hover:border-slate-200 hover:shadow-sm'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${expandedTrx === trx.id ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'}`}></div>
                          <span className="text-[10px] font-black text-slate-400 tracking-wider">#{trx.no_transaksi.split('-').pop()}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 font-mono italic">
                          {format(trx.tanggal?.toDate ? trx.tanggal.toDate() : new Date(trx.tanggal), 'HH:mm')}
                        </span>
                      </div>
                      <div className="flex justify-between items-end">
                        <p className="font-black text-lg text-slate-900 tracking-tight">Rp {trx.total_harga.toLocaleString()}</p>
                        <div className="p-1.5 rounded-full bg-white shadow-sm border border-slate-100">
                          {expandedTrx === trx.id ? <ChevronUp className="w-3.5 h-3.5 text-blue-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                      </div>
                    </button>

                    <AnimatePresence>
                      {expandedTrx === trx.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden bg-white mx-1"
                        >
                          <div className="p-4 pt-4 border-t border-slate-50 space-y-3">
                            <div className="space-y-1.5 opacity-80">
                              {trx.items?.map((item, i) => (
                                <div key={i} className="flex justify-between text-[11px] font-medium text-slate-600">
                                  <span className="flex-1 truncate pr-4">{item.nama_barang} <span className="text-slate-400 font-bold ml-1">x{item.jumlah}</span></span>
                                  <span className="font-bold font-mono">Rp {item.subtotal.toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2 pt-3 border-t border-slate-50/50">
                              <button
                                onClick={() => setShowReceipt(trx)}
                                className="flex-1 h-9 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all active:scale-95"
                              >
                                <Share2 className="w-3.5 h-3.5" /> Struk
                              </button>
                              <button
                                onClick={() => handleDeleteTrx(trx)}
                                className="h-9 w-9 flex items-center justify-center text-rose-500 bg-rose-50 hover:text-rose-600 hover:bg-rose-100 rounded-xl transition-all active:scale-95"
                                title="Hapus Transaksi"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="px-8 py-3 bg-white border-t border-slate-200 flex justify-between items-center sticky bottom-0 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">System Online</span>
          </div>
          <span className="text-slate-200">|</span>
          <div className="flex items-center gap-2 opacity-60">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Uptime: 24/7 Monitoring</span>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">KASIR CERDAS © 2025</p>
      </footer>

      <AnimatePresence>
        {showReceipt && (
          <ReceiptModal
            trx={showReceipt}
            onClose={() => setShowReceipt(null)}
          />
        )}

        {showInventory && (
          <InventoryModal
            onClose={() => {
              setShowInventory(false);
              loadData();
            }}
          />
        )}

        {showHistoryModal && (
          <HistoryModal
            history={history}
            onClose={() => setShowHistoryModal(false)}
            onDelete={loadData}
            onShowReceipt={(trx) => {
              setShowHistoryModal(false);
              setShowReceipt(trx);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}