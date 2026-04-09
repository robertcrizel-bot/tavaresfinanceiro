import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface UserCategory {
  id: string;
  name: string;
  type: "income" | "expense" | "both";
}

interface CategoryContextType {
  categories: UserCategory[];
  loading: boolean;
  addCategory: (name: string, type: UserCategory["type"]) => Promise<void>;
  updateCategory: (id: string, name: string, type: UserCategory["type"]) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  getCategoriesByType: (type: "income" | "expense") => string[];
  allCategoryNames: string[];
  refetch: () => void;
}

const CategoryContext = createContext<CategoryContextType | null>(null);

export const useCategories = () => {
  const ctx = useContext(CategoryContext);
  if (!ctx) throw new Error("useCategories must be inside CategoryProvider");
  return ctx;
};

const DEFAULT_CATEGORIES: { name: string; type: UserCategory["type"] }[] = [
  { name: "Alimentação", type: "expense" },
  { name: "Transporte", type: "expense" },
  { name: "Moradia", type: "expense" },
  { name: "Lazer", type: "expense" },
  { name: "Saúde", type: "expense" },
  { name: "Educação", type: "expense" },
  { name: "Fatura Cartão", type: "expense" },
  { name: "Salário", type: "income" },
  { name: "Freelance", type: "income" },
  { name: "Outros", type: "both" },
];

export const CategoryProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    if (!user) { setCategories([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      toast({ title: "Erro ao carregar categorias", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Seed defaults if user has no categories
    if (!data || data.length === 0) {
      const inserts = DEFAULT_CATEGORIES.map((c) => ({
        user_id: user.id,
        name: c.name,
        type: c.type,
      }));
      const { data: seeded, error: seedError } = await supabase
        .from("categories")
        .insert(inserts)
        .select();
      if (seedError) {
        toast({ title: "Erro ao criar categorias padrão", description: seedError.message, variant: "destructive" });
      } else {
        setCategories((seeded || []).map((r) => ({ id: r.id, name: r.name, type: r.type as UserCategory["type"] })));
      }
    } else {
      setCategories(data.map((r) => ({ id: r.id, name: r.name, type: r.type as UserCategory["type"] })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const addCategory = useCallback(async (name: string, type: UserCategory["type"]) => {
    if (!user) return;
    const { error } = await supabase.from("categories").insert({ user_id: user.id, name, type });
    if (error) {
      toast({ title: "Erro ao criar categoria", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Categoria criada", description: name });
      fetchCategories();
    }
  }, [user, fetchCategories]);

  const updateCategory = useCallback(async (id: string, name: string, type: UserCategory["type"]) => {
    const { error } = await supabase.from("categories").update({ name, type }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar categoria", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Categoria atualizada", description: name });
      fetchCategories();
    }
  }, [fetchCategories]);

  const deleteCategory = useCallback(async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir categoria", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Categoria excluída", variant: "destructive" });
      fetchCategories();
    }
  }, [fetchCategories]);

  const getCategoriesByType = useCallback((type: "income" | "expense") => {
    return categories
      .filter((c) => c.type === type || c.type === "both")
      .map((c) => c.name);
  }, [categories]);

  const allCategoryNames = categories.map((c) => c.name);

  return (
    <CategoryContext.Provider value={{ categories, loading, addCategory, updateCategory, deleteCategory, getCategoriesByType, allCategoryNames, refetch: fetchCategories }}>
      {children}
    </CategoryContext.Provider>
  );
};
