export interface Barang {
  id: string;
  nama_barang: string;
  harga_beli?: number;
  harga_jual: number;
  stok: number;
  aliases: string[];
  schema_version: number;
  created_at?: any;
}

export interface TransaksiItem {
  id?: string;
  barang_id: string;
  nama_barang: string;
  harga_beli?: number;
  harga_jual: number;
  jumlah: number;
  subtotal: number;
}

export interface Transaksi {
  id: string;
  no_transaksi: string;
  total_harga: number;
  total_qty: number;
  status: 'completed';
  tanggal: any;
  items?: TransaksiItem[];
}

export interface CartItem extends TransaksiItem {}
