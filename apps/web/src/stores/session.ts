import { create } from "zustand";
import { api, User } from "../lib/api";

type MatrixCreds = { userId: string; accessToken: string; deviceId: string; homeserver: string };

type SessionState = {
  user: User | null;
  matrix: MatrixCreds | null;
  ready: boolean;
  setAuth: (user: User, matrix?: MatrixCreds) => void;
  load: () => Promise<void>;
  clear: () => Promise<void>;
};

export const useSession = create<SessionState>((set) => ({
  user: null,
  matrix: JSON.parse(sessionStorage.getItem("impro.matrix") || "null"),
  ready: false,
  setAuth: (user, matrix) => {
    if (matrix) sessionStorage.setItem("impro.matrix", JSON.stringify(matrix));
    set({ user, matrix: matrix || null });
  },
  load: async () => {
    try {
      const { user } = await api.me();
      set({ user, ready: true });
    } catch {
      sessionStorage.removeItem("impro.matrix");
      set({ user: null, matrix: null, ready: true });
    }
  },
  clear: async () => {
    await api.logout().catch(() => undefined);
    sessionStorage.removeItem("impro.matrix");
    set({ user: null, matrix: null });
  },
}));
