import axios from "axios";
import { toast } from "@/hooks/use-toast";

export const api = axios.create({
  baseURL: "https://tavaresfinanceiro.lovable.app/api",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor global para respostas
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Tratamento genérico de erros de API para dar feedback visual
    const message = error.response?.data?.message || error.message || "Erro de conexão com o servidor.";
    
    // Evita um flood de toasts no cenário em que a API local está desligada e muitas queries quebram juntas
    if (error.config?.method !== "get" || error.response?.status >= 500) {
       toast({
         title: "Erro na comunicação",
         description: message,
         variant: "destructive",
       });
    }

    return Promise.reject(error);
  }
);
