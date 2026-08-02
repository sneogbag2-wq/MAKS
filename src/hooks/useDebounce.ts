// src/hooks/useDebounce.ts
import { useState, useEffect } from 'react';

/**
 * Belirtilen gecikme süresinden sonra güncellenen debounced değer döner.
 * Arama kutularında API/hesaplama çağrılarını azaltmak için kullanılır.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
