import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { uniqueCategoryNames } from "@/lib/category-options";

export interface UserCategory {
  id: string;
  name: string;
  type: "income" | "expense" | "both";
  monthlyBudget: number | null;
}

interface CategoryContextType {
  categories: UserCategory[];
  loading: boolean;
  addCategory: (name: string, type: UserCategory["type"], monthlyBudget?: number | null) => Promise<boolean>;
  updateCategory: (id: string, name: string, type: UserCategory["type"], monthlyBudget?: number | null) => Promise<void>;
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
  const categoryWrites = useRef(new Set<string>());

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
        if (seedError.code === "23505") {
          // Another device/tab completed the default seed while we were loading.
          const { data: populated } = await supabase.from("categories").select("*").order("name", { ascending: true });
          if (populated) {
            setCategories(populated.map((r) => ({
              id: r.id, name: r.name, type: r.type as UserCategory["type"],
              monthlyBudget: r.monthly_budget == null ? null : Number(r.monthly_budget),
            })));
          }
        } else {
          toast({ title: "Erro ao criar categorias padrão", description: seedError.message, variant: "destructive" });
        }
      } else {
        setCategories((seeded || []).map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type as UserCategory["type"],
          monthlyBudget: r.monthly_budget == null ? null : Number(r.monthly_budget),
        })));
      }
    } else {
      setCategories(data.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type as UserCategory["type"],
        monthlyBudget: r.monthly_budget == null ? null : Number(r.monthly_budget),
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const addCategory = useCallback(async (name: string, type: UserCategory["type"], monthlyBudget: number | null = null): Promise<boolean> => {
    if (!user) return false;
    const normalized = name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
    const key = `${user.id}:${type}:${normalized}`;
    if (!normalized || categoryWrites.current.has(key)) return false;
    if (categories.some((c) =>
      c.type === type && c.name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR") === normalized
    )) {
      toast({ title: "Categoria já cadastrada", description: "Esse nome e tipo já existem.", variant: "destructive" });
      return false;
    }
    categoryWrites.current.add(key);
    try {
      const { error } = await supabase.from("categories").insert({
        user_id: user.id,
        name,
        type,
        monthly_budget: type === "expense" ? monthlyBudget : null,
      });
      if (error) {
        toast({
          title: error.code === "23505" ? "Categoria já cadastrada" : "Erro ao criar categoria",
          description: error.code === "23505" ? "Já existe essa categoria; atualize a lista para conferir." : error.message,
          variant: "destructive",
        });
        return false;
      }
      toast({ title: "Categoria criada", description: name });
      await fetchCategories();
      return true;
    } catch {
      toast({ title: "Salvamento não confirmado", description: "Confira a lista antes de tentar novamente.", variant: "destructive" });
      return false;
    } finally {
      categoryWrites.current.delete(key);
    }
  }, [user, categories, fetchCategories]);

  const updateCategory = useCallback(async (
    id: string,
    name: string,
    type: UserCategory["type"],
    monthlyBudget: number | null = null,
  ) => {
    const { error } = await supabase.from("categories").update({
      name,
      type,
      monthly_budget: type === "expense" ? monthlyBudget : null,
    }).eq("id", id);
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
    return uniqueCategoryNames(categories
      .filter((c) => c.type === type || c.type === "both")
      .map((c) => c.name));
  }, [categories]);

  const allCategoryNames = uniqueCategoryNames(categories.map((c) => c.name));

  return (
    <CategoryContext.Provider value={{ categories, loading, addCategory, updateCategory, deleteCategory, getCategoriesByType, allCategoryNames, refetch: fetchCategories }}>
      {children}
    </CategoryContext.Provider>
  );
};
