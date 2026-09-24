"use client";

import { useState, useRef } from "react";
import { Plus, Tag, IndianRupee, Image as ImageIcon, Trash2, Save, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Product = {
  id?: string;
  name: string;
  price: number | "";
  image_url: string;
  is_active: boolean;
};

export function CatalogManager({ initialProducts, organizationId }: { initialProducts: any[], organizationId: string }) {
  const [products, setProducts] = useState<Product[]>(
    initialProducts.length > 0 ? initialProducts : [{ name: "", price: "", image_url: "", is_active: true }]
  );
  const [saving, setSaving] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);

  const handleImageUpload = async (index: number, file: File) => {
    if (!file) return;
    setUploadingIndex(index);
    
    // Generate a unique path for the image
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `${organizationId}/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('retail_catalog')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) {
      setMessage({ type: 'error', text: 'Failed to upload image. Make sure it is a valid image under 5MB.' });
      setUploadingIndex(null);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('retail_catalog')
      .getPublicUrl(filePath);

    updateProduct(index, "image_url", publicUrlData.publicUrl);
    setUploadingIndex(null);
  };

  const addProduct = () => {
    setProducts([...products, { name: "", price: "", image_url: "", is_active: true }]);
  };

  const removeProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const updateProduct = (index: number, field: keyof Product, value: any) => {
    const newProducts = [...products];
    newProducts[index] = { ...newProducts[index], [field]: value };
    setProducts(newProducts);
  };

  const handleSave = async () => {
    setSaving(true);
    
    // Basic validation
    const validProducts = products.filter(p => p.name.trim() !== "" && p.price !== "");
    
    // In a real implementation we would upsert, but for simplicity here we delete and re-insert
    // or just handle the upsert properly if IDs exist.
    
    const { error: delError } = await supabase
      .from("retail_catalog")
      .delete()
      .eq("organization_id", organizationId);

    if (delError) {
      setMessage({ type: 'error', text: 'Failed to update catalog.' });
      setSaving(false);
      return;
    }

    if (validProducts.length > 0) {
      const { error: insError } = await supabase
        .from("retail_catalog")
        .insert(
          validProducts.map(p => ({
            organization_id: organizationId,
            name: p.name,
            price: Number(p.price),
            image_url: p.image_url || null,
            is_active: p.is_active
          }))
        );
        
      if (insError) {
        setMessage({ type: 'error', text: 'Failed to save some products.' });
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setMessage({ type: 'success', text: 'Catalog saved successfully! These will now appear in your WhatsApp bot.' });
    
    // Auto-hide success message after 5 seconds
    setTimeout(() => setMessage(null), 5000);
  };

  return (
    <div className="grid gap-6">
      {message && (
        <div className={`rounded-xl p-4 text-sm font-semibold ${message.type === 'error' ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'}`}>
          {message.text}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product, index) => (
          <div key={index} className="group relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
            <button 
              onClick={() => removeProduct(index)}
              className="absolute -right-2 -top-2 rounded-full bg-rose-100 p-1.5 text-rose-600 opacity-0 shadow-sm transition-opacity hover:bg-rose-200 group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
            
            <div 
              className="group/img relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 transition-colors hover:border-indigo-400 hover:bg-indigo-50"
              onClick={() => {
                setActiveUploadIndex(index);
                fileInputRef.current?.click();
              }}
            >
              {product.image_url ? (
                <>
                  <img src={product.image_url} alt="Product" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/img:opacity-100">
                    <span className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-900">
                      <Upload className="size-3" /> Change Photo
                    </span>
                  </div>
                </>
              ) : uploadingIndex === index ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="size-6 animate-spin text-indigo-500" />
                  <span className="text-xs font-medium text-indigo-500">Uploading...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <ImageIcon className="size-8 opacity-50" />
                  <span className="text-xs font-medium">Tap to add photo</span>
                </div>
              )}
            </div>

            <div className="grid gap-3">
              <label className="relative">
                <Tag className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Product Name" 
                  value={product.name}
                  onChange={(e) => updateProduct(index, "name", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </label>

              <label className="relative">
                <IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input 
                  type="number" 
                  placeholder="Price" 
                  value={product.price}
                  onChange={(e) => updateProduct(index, "price", e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </label>

            </div>
          </div>
        ))}

        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*" 
          className="hidden" 
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && activeUploadIndex !== null) {
              handleImageUpload(activeUploadIndex, file);
            }
            e.target.value = ''; // Reset input
          }} 
        />

        <button 
          onClick={addProduct}
          className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 text-indigo-600 transition-colors hover:bg-indigo-50 hover:border-indigo-300"
        >
          <div className="rounded-full bg-indigo-100 p-3">
            <Plus className="size-6" />
          </div>
          <span className="font-semibold">Add another product</span>
        </button>
      </div>

      <div className="sticky bottom-6 flex justify-end">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex min-h-12 items-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-70"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? "Saving Catalog..." : "Save Catalog to WhatsApp"}
        </button>
      </div>
    </div>
  );
}
