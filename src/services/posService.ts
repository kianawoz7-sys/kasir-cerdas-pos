import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  runTransaction,
  increment,
  getDoc,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Barang, Transaksi, TransaksiItem } from '../types';
import { format } from 'date-fns';

const BARANG_COL = 'barang';
const TRANSAKSI_COL = 'transaksi';
const COUNTERS_COL = 'counters';

export const posService = {
  // ==========================================
  // BARANG
  // ==========================================
  async getBarang(): Promise<Barang[]> {
    try {
      const q = query(collection(db, BARANG_COL), orderBy('nama_barang', 'asc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Barang));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, BARANG_COL);
      return [];
    }
  },

  async addBarang(barang: Omit<Barang, 'id'>) {
    try {
      await addDoc(collection(db, BARANG_COL), {
        ...barang,
        created_at: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, BARANG_COL);
    }
  },

  async updateBarang(id: string, data: Partial<Barang>) {
    try {
      await updateDoc(doc(db, BARANG_COL, id), data);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${BARANG_COL}/${id}`);
    }
  },

  async deleteBarang(id: string) {
    try {
      await deleteDoc(doc(db, BARANG_COL, id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${BARANG_COL}/${id}`);
    }
  },

  // ==========================================
  // TRANSAKSI NUMBER GENERATOR
  // ==========================================
  async generateTrxNumber(): Promise<string> {
    const today = format(new Date(), 'yyyyMMdd');
    const counterRef = doc(db, COUNTERS_COL, today);

    try {
      return await runTransaction(db, async (transaction) => {
        // READ
        const counterDoc = await transaction.get(counterRef);
        let newCount = 1;

        // WRITE
        if (counterDoc.exists()) {
          newCount = counterDoc.data().count + 1;
          transaction.update(counterRef, { count: newCount });
        } else {
          transaction.set(counterRef, { count: 1 });
        }

        return `TRX-${today}-${String(newCount).padStart(4, '0')}`;
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, COUNTERS_COL);
      return `TRX-${today}-ERROR`;
    }
  },

  // ==========================================
  // CHECKOUT TRANSAKSI
  // ==========================================
  async checkout(trxData: Omit<Transaksi, 'id' | 'tanggal' | 'no_transaksi'>, items: TransaksiItem[]) {
    try {
      const trxNumber = await this.generateTrxNumber();

      return await runTransaction(db, async (transaction) => {
        const trxRef = doc(collection(db, TRANSAKSI_COL));
        const timestamp = new Date();
        const barangRefsToUpdate = [];

        // --- FASE 1: READS ---
        // Baca SEMUA data barang dulu buat ngecek stok
        for (const item of items) {
          const barangRef = doc(db, BARANG_COL, item.barang_id);
          const barangDoc = await transaction.get(barangRef);

          if (!barangDoc.exists()) {
            throw new Error(`Barang ${item.nama_barang} tidak ditemukan`);
          }

          const currentStok = barangDoc.data().stok;
          if (currentStok < item.jumlah) {
            throw new Error(`Stok ${item.nama_barang} tidak mencukupi. Sisa: ${currentStok}`);
          }

          // Simpan referensi buat Fase Tulis nanti
          barangRefsToUpdate.push({ ref: barangRef, jumlah: item.jumlah });
        }

        // --- FASE 2: WRITES ---
        // 1. Tulis doc transaksi utama
        transaction.set(trxRef, {
          ...trxData,
          no_transaksi: trxNumber,
          tanggal: timestamp,
          status: 'completed'
        });

        // 2. Tulis ke subcollection items
        for (const item of items) {
          const itemRef = doc(collection(db, `${TRANSAKSI_COL}/${trxRef.id}/items`));
          transaction.set(itemRef, item);
        }

        // 3. Potong stok barang
        for (const b of barangRefsToUpdate) {
          transaction.update(b.ref, {
            stok: increment(-b.jumlah)
          });
        }

        return { id: trxRef.id, no_transaksi: trxNumber, tanggal: timestamp };
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, TRANSAKSI_COL);
      throw e;
    }
  },

  // ==========================================
  // HISTORY TRANSAKSI
  // ==========================================
  async getTransaksi(): Promise<Transaksi[]> {
    try {
      const q = query(collection(db, TRANSAKSI_COL), orderBy('tanggal', 'desc'));
      const snapshot = await getDocs(q);
      const trxList: Transaksi[] = [];

      for (const d of snapshot.docs) {
        const itemsSnap = await getDocs(collection(db, `${TRANSAKSI_COL}/${d.id}/items`));
        const items = itemsSnap.docs.map(idoc => ({ id: idoc.id, ...idoc.data() } as TransaksiItem));
        trxList.push({ id: d.id, ...d.data(), items } as Transaksi);
      }

      return trxList;
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, TRANSAKSI_COL);
      return [];
    }
  },

  async deleteTransaksi(trx: Transaksi) {
    try {
      // BACA data subcollection DULU sebelum mulai transaksi tulis
      const itemsSnap = await getDocs(collection(db, `${TRANSAKSI_COL}/${trx.id}/items`));

      // Pake writeBatch karena kita cuma mau ngelakuin operasi TULIS (Hapus & Balikin Stok)
      // Gak perlu runTransaction kalo gak ada operasi BACA di dalemnya
      const batch = writeBatch(db);

      // 1. Kembalikan stok barang
      if (trx.items) {
        for (const item of trx.items) {
          const barangRef = doc(db, BARANG_COL, item.barang_id);
          batch.update(barangRef, {
            stok: increment(item.jumlah)
          });
        }
      }

      // 2. Hapus isi subcollection items
      for (const itemDoc of itemsSnap.docs) {
        batch.delete(itemDoc.ref);
      }

      // 3. Hapus document transaksi utamanya
      batch.delete(doc(db, TRANSAKSI_COL, trx.id));

      // Eksekusi semua hapus & balikin stok secara bersamaan
      await batch.commit();

    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, TRANSAKSI_COL);
      throw e;
    }
  }
};