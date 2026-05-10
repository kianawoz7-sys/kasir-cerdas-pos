import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  Search, 
  Package,
  AlertCircle
} from 'lucide-react';
import { posService } from '../services/posService';
import { Barang } from '../types';
import { toast } from 'react-hot-toast';
import { customConfirm } from '../utils/confirmDialog';

interface Props {
  onClose: () => void;
}

export const InventoryModal: React.FC<Props> = ({ onClose }) => {
  const [items, setItems] = useState<Barang[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nama_barang: '',
    harga: 0,
    stok: 0
  });

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    const data = await posService.getBarang();
    setItems(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nama_barang || form.harga < 0 || form.stok < 0) {
      toast.error('Data tidak valid');
      return;
    }

    const loadToast = toast.loading('Menyimpan...');
    try {
      if (editingId) {
        await posService.updateBarang(editingId, form);
        toast.success('Barang diperbarui');
      } else {
        await posService.addBarang(form);
        toast.success('Barang ditambahkan');
      }
      setForm({ nama_barang: '', harga: 0, stok: 0 });
      setEditingId(null);
      loadItems();
    } catch (err) {
      toast.error('Gagal menyimpan');
    } finally {
      toast.dismiss(loadToast);
    }
  };

  const handleEdit = (item: Barang) => {
    setEditingId(item.id);
    setForm({
      nama_barang: item.nama_barang,
      harga: item.harga,
      stok: item.stok
    });
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await customConfirm('Hapus barang ini dari database?');
    if (!isConfirmed) return;
    
    const loadToast = toast.loading('Menghapus...');
    try {
      await posService.deleteBarang(id);
      toast.success('Terhapus');
      loadItems();
    } catch (err) {
      toast.error('Gagal menghapus');
    } finally {
      toast.dismiss(loadToast);
    }
  };

  const filteredItems = items.filter(i => 
    i.nama_barang.toLowerCase().includes(search.toLowerCase()) &&
    (!showOnlyInStock || i.stok > 0)
  );

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
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="relative bg-white rounded-[2rem] shadow-2xl max-w-4xl w-full h-[90vh] overflow-hidden flex flex-col border border-slate-200"
      >
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
          <button onClick={onClose} className="absolute right-4 top-4 md:relative md:right-auto md:top-auto p-2 hover:bg-slate-100 rounded-full transition-all active:scale-90">
            <X className="w-5 h-5 md:w-6 md:h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-12 bg-slate-50/30">
          {/* Left: Form */}
          <div className="md:col-span-4 p-4 md:p-8 border-b md:border-b-0 md:border-r border-slate-100 bg-white">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${editingId ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`}></div>
              {editingId ? 'Edit Barang' : 'Barang Baru'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Nama Barang</label>
                <input 
                  type="text" 
                  className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-bold text-slate-700"
                  placeholder="Nama Produk..."
                  value={form.nama_barang}
                  onChange={e => setForm({...form, nama_barang: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Harga Jual</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">Rp</div>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-bold text-slate-700"
                    placeholder="0"
                    value={form.harga === 0 ? '' : form.harga.toLocaleString('id-ID')}
                    onChange={e => {
                      const rawVal = e.target.value.replace(/\D/g, '');
                      const val = rawVal === '' ? 0 : parseInt(rawVal);
                      setForm({...form, harga: isNaN(val) ? 0 : val});
                    }}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Stok Inventory</label>
                <input 
                  type="number" 
                  className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-bold text-slate-700"
                  placeholder="0"
                  value={form.stok === 0 ? '' : form.stok}
                  onChange={e => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                    setForm({...form, stok: isNaN(val) ? 0 : val});
                  }}
                  required
                />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button 
                  type="submit"
                  className={`flex-1 h-12 rounded-xl text-white font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 ${editingId ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20' : 'bg-slate-900 hover:bg-black shadow-slate-900/20'}`}
                >
                  {editingId ? 'Perbarui' : 'Simpan'}
                </button>
                {editingId && (
                  <button 
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm({ nama_barang: '', harga: 0, stok: 0 });
                    }}
                    className="h-12 w-12 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-all active:scale-90"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                )}
              </div>
            </form>

            <div className="mt-12 p-5 rounded-2xl bg-slate-50 border border-slate-100 italic">
              <div className="flex gap-4">
                <AlertCircle className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  Informasi stok akan terpotong otomatis saat transaksi dilakukan di halaman kasir.
                </p>
              </div>
            </div>
          </div>

          {/* Right: List */}
          <div className="md:col-span-8 flex flex-col bg-slate-50/30">
            <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row items-center gap-4 bg-white/50 backdrop-blur-md">
              <div className="relative w-full md:flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Cari inventory..."
                  className="w-full h-11 bg-white border border-slate-200 rounded-xl pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex w-full md:w-auto items-center justify-between gap-4">
                <button 
                  onClick={() => setShowOnlyInStock(!showOnlyInStock)}
                  className={`flex-1 md:flex-none justify-center items-center gap-2 px-4 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    showOnlyInStock 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                      : 'bg-white text-slate-400 border border-slate-200 hover:border-blue-200 hover:text-blue-500'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 inline-block mr-1" />
                  {showOnlyInStock ? 'Tersedia' : 'Semua'}
                </button>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                  {filteredItems.length} Items
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 md:h-auto min-h-[300px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Database...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-24 text-slate-300">
                  <Package className="w-20 h-20 mx-auto mb-4 opacity-10" />
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Database Kosong</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {filteredItems.map(item => (
                    <motion.div 
                      key={item.id}
                      layout
                      className="p-5 bg-white border border-slate-100 rounded-[1.5rem] shadow-sm hover:shadow-xl hover:border-blue-100 transition-all group relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-black text-slate-800 text-lg leading-tight mb-1">{item.nama_barang}</h4>
                          <p className="text-sm font-bold text-blue-600 tracking-tight">Rp {item.harga.toLocaleString()}</p>
                        </div>
                        <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${item.stok > 10 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                          Stok: {item.stok}
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
    </div>
  );
};
