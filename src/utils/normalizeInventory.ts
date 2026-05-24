export function normalizeInventory(item: any): any {
  return {
    ...item,
    // Backward compatibility
    harga_jual: Number(item.harga_jual ?? item.harga ?? 0),
    harga_beli: Number(item.harga_beli ?? 0),
    stok: Number(item.stok ?? 0),
    
    // Safe aliases
    aliases: Array.isArray(item.aliases) ? item.aliases : [],
    
    // Schema tracking
    schema_version: Number(item.schema_version ?? 1),
  };
}

export function normalizeTransaksiItem(item: any): any {
  return {
    ...item,
    harga_jual: Number(item.harga_jual ?? item.harga ?? 0),
    harga_beli: Number(item.harga_beli ?? 0),
    jumlah: Number(item.jumlah ?? 0),
    subtotal: Number(item.subtotal ?? 0),
  };
}
