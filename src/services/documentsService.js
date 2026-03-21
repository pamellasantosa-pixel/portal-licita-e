import { getSupabaseClientOrThrow } from "../lib/supabaseClient";

export async function uploadDocumentFile({ file, folder = "uploads" }) {
  const supabase = getSupabaseClientOrThrow();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Usuario nao autenticado.");
  if (!file) throw new Error("Arquivo obrigatorio.");

  const ext = file.name.split(".").pop() || "bin";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (uploadError) {
    if (String(uploadError.message || "").toLowerCase().includes("bucket not found")) {
      throw new Error("Falha no upload: bucket 'documents' nao encontrado. Execute o schema atualizado no Supabase (storage bucket/policies).");
    }
    throw new Error(`Falha no upload: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from("documents").getPublicUrl(path);
  return {
    fileUrl: data.publicUrl,
    fileType: ext.toLowerCase()
  };
}
