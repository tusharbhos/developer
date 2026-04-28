"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";

export interface CartItem {
  id: number;
  title: string;
  image_url?: string;
  meeting_date?: string;
  created_at?: string;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (projectId: number) => void;
  clearCart: () => void;
  cartCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [storageKey, setStorageKey] = useState("cart_items_guest");
  const [hydrated, setHydrated] = useState(false);

  // Load cart per logged-in user so carts never leak across users on same device.
  useEffect(() => {
    if (isLoading) return;

    const nextKey =
      isAuthenticated && user?.id
        ? `cart_items_user_${user.id}`
        : "cart_items_guest";

    setStorageKey(nextKey);

    const saved = localStorage.getItem(nextKey);
    if (!saved) {
      setCartItems([]);
      setHydrated(true);
      return;
    }

    try {
      setCartItems(JSON.parse(saved));
    } catch (e) {
      console.error("Failed to load cart:", e);
      setCartItems([]);
    }
    setHydrated(true);
  }, [isLoading, isAuthenticated, user?.id]);

  // Save only after the active user's cart has been hydrated.
  useEffect(() => {
    if (!hydrated || isLoading) return;
    localStorage.setItem(storageKey, JSON.stringify(cartItems));
  }, [cartItems, storageKey, hydrated, isLoading]);

  const addToCart = (item: CartItem) => {
    setCartItems((prev) => {
      // Check if item already exists
      const exists = prev.some((i) => i.id === item.id);
      if (exists) return prev;

      const now = new Date();
      const today = now.toISOString().slice(0, 10);

      return [
        ...prev,
        {
          ...item,
          meeting_date: item.meeting_date || today,
          created_at: item.created_at || now.toISOString(),
        },
      ];
    });
  };

  const removeFromCart = (projectId: number) => {
    setCartItems((prev) => prev.filter((i) => i.id !== projectId));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        clearCart,
        cartCount: cartItems.length,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
};
